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
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){}})()`;
