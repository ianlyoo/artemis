(() => {
  const requested = new URL(location.href).searchParams.get("theme");
  let saved;
  try {
    saved = localStorage.getItem("artemis-home-theme");
  } catch {
  }
  const theme = ["light", "dark"].includes(requested) ? requested : saved === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  if (requested === "light" || requested === "dark") {
    try {
      localStorage.setItem("artemis-home-theme", theme);
    } catch {
    }
  }
})();
