const intro = document.querySelector("#intro");

function removeIntroWhenComplete(event) {
  if (event.target === intro && event.animationName === "intro-leave") {
    intro.remove();
  }
}

try {
  if (window.sessionStorage.getItem("wedding-intro-v5")) {
    document.body.classList.add("intro-skip");
    intro.remove();
  } else {
    window.sessionStorage.setItem("wedding-intro-v5", "true");
    intro.addEventListener("animationend", removeIntroWhenComplete);
  }
} catch {
  intro.addEventListener("animationend", removeIntroWhenComplete);
}

const toast = document.querySelector("#toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

const music = document.querySelector("#background-music");
const musicToggle = document.querySelector("#music-toggle");

music.volume = 0.34;

function updateMusicButton(isPlaying) {
  musicToggle.classList.toggle("is-playing", isPlaying);
  musicToggle.setAttribute("aria-pressed", String(isPlaying));
  musicToggle.setAttribute("aria-label", isPlaying ? "배경음악 일시정지" : "배경음악 재생");
}

musicToggle.addEventListener("click", async () => {
  if (!music.paused) {
    music.pause();
    return;
  }

  try {
    await music.play();
  } catch {
    showToast("음악을 불러오지 못했습니다. 잠시 후 다시 눌러주세요.");
  }
});

music.addEventListener("play", () => updateMusicButton(true));
music.addEventListener("pause", () => updateMusicButton(false));

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
