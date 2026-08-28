const intro = document.querySelector("#intro");

try {
  if (window.sessionStorage.getItem("wedding-intro-v3")) {
    document.body.classList.add("intro-skip");
    intro.remove();
  } else {
    window.sessionStorage.setItem("wedding-intro-v3", "true");
    intro.addEventListener("animationend", () => intro.remove(), { once: true });
  }
} catch {
  intro.addEventListener("animationend", () => intro.remove(), { once: true });
}

const weddingDate = new Date("2027-03-28T11:30:00+09:00");
const dayDifference = Math.ceil((weddingDate - new Date()) / 86400000);
const dDay = document.querySelector("#d-day");

if (dayDifference > 0) {
  dDay.textContent = `D-${dayDifference}`;
} else if (dayDifference === 0) {
  dDay.textContent = "TODAY";
} else {
  dDay.textContent = "2027.03.28";
}

const toast = document.querySelector("#toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

document.querySelector("#copy-address").addEventListener("click", async () => {
  const address = document.querySelector("#venue-address").textContent.trim();

  try {
    await navigator.clipboard.writeText(address);
    showToast("주소를 복사했습니다.");
  } catch {
    showToast(`주소: ${address}`);
  }
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealItems = document.querySelectorAll(".reveal");

if (reducedMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.12 },
  );

  revealItems.forEach((item) => observer.observe(item));
}
