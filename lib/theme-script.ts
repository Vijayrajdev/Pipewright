/**
 * Plain (non-client) module so the server layout can inline the script string.
 * Importing a value from a "use client" file into a Server Component yields a
 * client reference, not the value.
 */
export type Theme = "light" | "dark";
export const THEME_KEY = "pipewright:theme";

/**
 * Runs in <head> before first paint: saved choice, else the OS preference.
 * Keep it tiny and dependency-free; it's inlined as a string.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
