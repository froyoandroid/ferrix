// Applies the saved app appearance before first paint (external file: the CSP blocks inline scripts).
(function () {
  try {
    var m = localStorage.getItem("ferrix.mode") || "system";
    var dark = m === "dark" || (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.mode = dark ? "dark" : "light";
  } catch (e) {}
})();
