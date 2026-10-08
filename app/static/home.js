"use strict";

document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reveals = document.querySelectorAll(".reveal");
if (!reduceMotion && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }
  }, {threshold: .1, rootMargin: "0px 0px 35px 0px"});
  reveals.forEach((element) => observer.observe(element));
} else reveals.forEach((element) => element.classList.add("visible"));

const tabs = [...document.querySelectorAll(".impact-tab")];
function selectTab(tab) {
  for (const item of tabs) {
    const active = item === tab;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(`panel-${item.dataset.panel}`).hidden = !active;
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[target]);
    tabs[target].focus();
  });
});

const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.getElementById("mobile-nav");
function closeMenu() {
  mobileNav.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Abrir menu");
}
menuButton.addEventListener("click", () => {
  const open = mobileNav.hidden;
  mobileNav.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
});
mobileNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
