import { createClient } from 'npm:@supabase/supabase-js@2';

const jsonHeaders = { 'content-type':'application/json; charset=utf-8' };
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
};
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

type ProjectSummary = { project_number:string; portal_token:string };

async function sendEmail(
  resendKey: string,
  fromEmail: string,
  to: string,
  subject: string,
  html: string,
  idempotencyKey: string
) {
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{
      authorization:`Bearer ${resendKey}`,
      'content-type':'application/json',
      'Idempotency-Key':idempotencyKey
    },
    body:JSON.stringify({ from:fromEmail, to:[to], subject, html })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${body}`);
  try { return JSON.parse(body)?.id || null; } catch { return null; }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error:'Method not allowed' }), { status:405, headers:jsonHeaders });
  try {
    const webhookSecret = required('DATABASE_WEBHOOK_SECRET');
    if (request.headers.get('x-pool-designer-webhook-secret') !== webhookSecret) {
      return new Response(JSON.stringify({ error:'Unauthorized' }), { status:401, headers:jsonHeaders });
    }

    const payload = await request.json();
    const activityId = payload?.record?.id || payload?.activity_id;
    if (!activityId) return new Response(JSON.stringify({ error:'Missing activity id' }), { status:400, headers:jsonHeaders });

    const supabaseUrl = required('SUPABASE_URL');
    const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = required('RESEND_API_KEY');
    const fromEmail = required('NOTIFICATION_FROM_EMAIL');
    const siteUrl = required('SITE_URL').replace(/\/$/, '');
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth:{ persistSession:false, autoRefreshToken:false } });

    const { data:activity, error:activityError } = await admin
      .from('project_activity')
      .select('id,project_id,title,detail,event_type,projects!inner(project_number,portal_token)')
      .eq('id', activityId)
      .single();
    if (activityError) throw activityError;

    const { data:notifications, error:notificationError } = await admin
      .from('notifications')
      .select('id,user_id')
      .eq('activity_id', activityId)
      .eq('status', 'pending');
    if (notificationError) throw notificationError;

    const projectRelation = activity.projects as unknown as ProjectSummary | ProjectSummary[];
    const project = Array.isArray(projectRelation) ? projectRelation[0] : projectRelation;
    if (!project) throw new Error('Project details were not returned for this activity.');

    let sent = 0;
    let failed = 0;
    for (const notification of notifications || []) {
      try {
        const [{ data:userResult, error:userError }, { data:profile, error:profileError }] = await Promise.all([
          admin.auth.admin.getUserById(notification.user_id),
          admin.from('profiles').select('role').eq('id', notification.user_id).single()
        ]);
        if (userError) throw userError;
        if (profileError) throw profileError;
        const email = userResult.user?.email;
        if (!email) throw new Error('Recipient has no email address.');
        const isBuilder = profile.role === 'builder';
        const actionUrl = isBuilder
          ? `${siteUrl}/builder/index.html?project=${encodeURIComponent(activity.project_id)}`
          : `${siteUrl}/project/index.html?token=${encodeURIComponent(project.portal_token)}`;
        await sendEmail(
          resendKey,
          fromEmail,
          email,
          `${project.project_number}: ${activity.title}`,
          `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202421;line-height:1.5">
              <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#66706b">My Pool Designer · ${escapeHtml(project.project_number)}</p>
              <h1 style="font-size:26px;font-weight:400">${escapeHtml(activity.title)}</h1>
              <p>${escapeHtml(activity.detail || 'There is an update on your pool project.')}</p>
              <p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#202421;color:#fff;text-decoration:none">Open project</a></p>
              <p style="font-size:12px;color:#717773">For security, sign in using the email address that received this message.</p>
            </body></html>`,
          `notification-${notification.id}`
        );
        await admin.from('notifications').update({ status:'sent', sent_at:new Date().toISOString() }).eq('id', notification.id);
        sent += 1;
      } catch (error) {
        failed += 1;
        await admin.from('notifications').update({ status:'failed' }).eq('id', notification.id);
        console.error('Notification delivery failed', notification.id, error);
      }
    }

    const { data:directoryContacts, error:directoryError } = await admin.rpc('claim_builder_contact_emails', {
      p_activity_id:activityId
    });
    if (directoryError) throw directoryError;

    let directorySent = 0;
    let directoryFailed = 0;
    const isVariation = activity.event_type === 'design_version_created';
    for (const contact of directoryContacts || []) {
      try {
        const actionUrl = `${siteUrl}/builder/index.html?project=${encodeURIComponent(activity.project_id)}`;
        const providerMessageId = await sendEmail(
          resendKey,
          fromEmail,
          contact.builder_email,
          `${isVariation ? 'Updated' : 'New'} pool enquiry ${project.project_number} via My Pool Designer`,
          `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202421;line-height:1.5">
            <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#66706b">My Pool Designer · ${escapeHtml(project.project_number)}</p>
            <h1 style="font-size:26px;font-weight:400">${isVariation ? 'Pool enquiry updated' : 'New pool enquiry'} for ${escapeHtml(contact.builder_name)}</h1>
            <p>${isVariation
              ? 'The homeowner has submitted a variation to an enquiry previously shared with your business. Please review the latest design and project details.'
              : 'A homeowner selected your business to review their pool design and provide a quotation through My Pool Designer.'}</p>
            <p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#202421;color:#fff;text-decoration:none">Review enquiry</a></p>
            <p>Sign in using <strong>${escapeHtml(contact.builder_email)}</strong>. On first sign-in, this verified business email is linked to your builder profile.</p>
            <p style="font-size:12px;color:#717773">This is a project enquiry, not a marketing email. It was requested by a homeowner who selected your publicly listed pool-building business.</p>
          </body></html>`,
          `directory-enquiry-${contact.queue_id}`
        );
        const { error:updateError } = await admin.from('builder_contact_queue').update({
          status:'contacted',
          delivery_status:'sent',
          delivered_at:new Date().toISOString(),
          provider_message_id:providerMessageId,
          last_error:null,
          updated_at:new Date().toISOString()
        }).eq('id', contact.queue_id).eq('delivery_status', 'processing');
        if (updateError) throw updateError;
        directorySent += 1;
      } catch (error) {
        directoryFailed += 1;
        await admin.from('builder_contact_queue').update({
          delivery_status:'failed',
          last_error:String(error instanceof Error ? error.message : error).slice(0, 1000),
          updated_at:new Date().toISOString()
        }).eq('id', contact.queue_id).eq('delivery_status', 'processing');
        console.error('Directory builder delivery failed', contact.queue_id, error);
      }
    }

    return new Response(JSON.stringify({ activityId, sent, failed, directorySent, directoryFailed }), { status:200, headers:jsonHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error:error instanceof Error ? error.message : 'Notification failed' }), { status:500, headers:jsonHeaders });
  }
});
