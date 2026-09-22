"use strict";
const header = document.querySelector('.site-header');
const menu = document.querySelector('.mobile-toggle, .menu-btn');
const nav = header?.querySelector('.main-nav, .nav-links');
const setMenu = (open) => {
    if (!header || !nav)
        return;
    nav.classList.toggle('open', open);
    header.classList.toggle('mobile-open', open);
    menu?.setAttribute('aria-expanded', String(open));
    if (open)
        header.classList.remove('site-header-hidden');
};
menu?.addEventListener('click', () => setMenu(!nav?.classList.contains('open')));
nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
const year = document.querySelector('[data-year]');
if (year)
    year.textContent = String(new Date().getFullYear());
const form = document.querySelector('[data-contact-form]');
form?.addEventListener('submit', e => {
    e.preventDefault();
    const notice = document.querySelector('[data-form-notice]');
    if (notice) {
        notice.style.display = 'block';
        notice.textContent = 'Thanks — your details have been checked. This contact form still needs to be connected to the production enquiry service before launch.';
    }
    form.reset();
});
if (header && !document.body.classList.contains('pool-designer-page')) {
    let previousY = window.scrollY;
    let frame = 0;
    const revealThreshold = 48;
    const hideThreshold = 180;
    const updateHeader = () => {
        frame = 0;
        const y = window.scrollY;
        header.classList.toggle('is-scrolled', y > 18);
        const menuOpen = nav?.classList.contains('open');
        if (y < revealThreshold || menuOpen || y < previousY - 3)
            header.classList.remove('site-header-hidden');
        else if (y > previousY + 6 && y > hideThreshold)
            header.classList.add('site-header-hidden');
        previousY = y;
    };
    window.addEventListener('scroll', () => {
        if (!frame)
            frame = requestAnimationFrame(updateHeader);
    }, { passive: true });
    updateHeader();
}
document.querySelectorAll('[data-image-compare]').forEach(compare => {
    const range = compare.querySelector('.compare-range');
    if (!range)
        return;
    const update = () => compare.style.setProperty('--compare', `${range.value}%`);
    range.addEventListener('input', update);
    range.addEventListener('change', update);
    update();
});
