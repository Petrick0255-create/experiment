const menuButton = document.querySelector("#menuButton");
const mobileMenu = document.querySelector("#mobileMenu");
const currentYear = document.querySelector("#currentYear");

if (currentYear) currentYear.textContent = new Date().getFullYear();

menuButton?.addEventListener("click", () => {
  const isOpen = mobileMenu?.classList.toggle("open") ?? false;
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "메뉴 닫기" : "메뉴 열기");
});

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenu.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.setAttribute("aria-label", "메뉴 열기");
  });
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) {
    mobileMenu?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  }
});
