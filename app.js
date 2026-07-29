import { db, firebaseReady } from "./firebase.js";

const menuButton = document.querySelector("#menuButton");
const mobileMenu = document.querySelector("#mobileMenu");
const themeToggle = document.querySelector("#themeToggle");
const currentYear = document.querySelector("#currentYear");

currentYear.textContent = new Date().getFullYear();

menuButton?.addEventListener("click", () => {
  const open = mobileMenu.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenu.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  });
});

const savedTheme = localStorage.getItem("experiment-theme");
if (savedTheme === "dark") document.body.classList.add("dark");

themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "experiment-theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
});

// Firebase 설정을 입력한 뒤 목록·준비물 데이터를 연결할 때 사용합니다.
if (firebaseReady) {
  console.info("Firebase가 연결되었습니다.", db);
}
