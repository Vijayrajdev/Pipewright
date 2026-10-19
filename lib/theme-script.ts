/**
 * Plain (non-client) module so the server layout can inline the script string.
 * Importing a value from a "use client" file into a Server Component yields a
 * client reference, not the value.
 */
export type Theme = "light" | "dark";
export const THEME_KEY = "pipewright:theme";

/**
 * Runs in <head> before first paint. Light is the default; dark only when the
 * visitor has switched to it. Keep it tiny and dependency-free; it's inlined as a string.
 */
/** Browser-bar colour per theme (mobile address bar, PWA title bar). */
export const THEME_COLORS: Record<Theme, string> = { light: "#eae6de", dark: "#0e1620" };

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")==="dark"?"dark":"light";document.documentElement.setAttribute("data-theme",t);var c=${JSON.stringify(THEME_COLORS)}[t];document.addEventListener("DOMContentLoaded",function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c)})}catch(e){}})()`;
