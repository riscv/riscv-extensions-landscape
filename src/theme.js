import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// useTheme – canonical dark/light hook for this project.
//
// • Toggles the `dark` class on <html> — the pattern Tailwind's darkMode:'class'
//   strategy expects.
// • Persists the user choice in localStorage under 'riscv-theme'.
// • Defaults to the OS/browser color-scheme preference on first visit.
// ---------------------------------------------------------------------------
export function useTheme() {
    const [isDark, setIsDark] = useState(() => {
        if (typeof window === 'undefined') return false;
        const stored = localStorage.getItem('riscv-theme');
        if (stored) return stored === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('riscv-theme', isDark ? 'dark' : 'light');
    }, [isDark]);

    const toggle = () => setIsDark((d) => !d);

    return { isDark, toggle };
}

// ---------------------------------------------------------------------------
// TILE_COLORS – extension tile background/border/text palette.
//
// Each value is a plain Tailwind class string containing both the light-mode
// default and a `dark:` override.  Because these are module-level constants
// they are evaluated once at import time — no per-render cost.
// ---------------------------------------------------------------------------
export const TILE_COLORS = {
    base: 'bg-blue-100     border-blue-300     text-blue-900     dark:bg-blue-950/80   dark:border-blue-800     dark:text-blue-100',
    standard: 'bg-emerald-100  border-emerald-300  text-emerald-900  dark:bg-emerald-950   dark:border-emerald-800  dark:text-emerald-100',
    bit: 'bg-purple-100   border-purple-300   text-purple-900   dark:bg-purple-950/50 dark:border-purple-800/50 dark:text-purple-100',
    atomics: 'bg-amber-100    border-amber-300    text-amber-900    dark:bg-amber-950/40  dark:border-amber-800/50  dark:text-amber-100',
    compress: 'bg-indigo-100   border-indigo-300   text-indigo-900   dark:bg-indigo-950/50 dark:border-indigo-800/50 dark:text-indigo-100',
    float: 'bg-pink-100     border-pink-300     text-pink-900     dark:bg-pink-950/50   dark:border-pink-800/50  dark:text-pink-100',
    vector: 'bg-sky-100      border-sky-300      text-sky-900      dark:bg-sky-950/40    dark:border-sky-800/40   dark:text-sky-100',
    security: 'bg-fuchsia-100  border-fuchsia-300  text-fuchsia-900  dark:bg-fuchsia-950/40 dark:border-fuchsia-800/40 dark:text-fuchsia-100',
    crypto: 'bg-teal-100     border-teal-300     text-teal-900     dark:bg-teal-950/50   dark:border-teal-800/50  dark:text-teal-100',
    system: 'bg-red-100      border-red-300      text-red-900      dark:bg-red-950/50    dark:border-red-800/50   dark:text-red-100',
    smem: 'bg-slate-200    border-slate-400    text-slate-800    dark:bg-slate-800     dark:border-slate-600    dark:text-slate-300',
    sint: 'bg-violet-100   border-violet-300   text-violet-900   dark:bg-violet-950/40 dark:border-violet-800/40 dark:text-violet-100',
    strap1: 'bg-orange-100   border-orange-300   text-orange-900   dark:bg-orange-950/50 dark:border-orange-800/50 dark:text-orange-100',
    strap2: 'bg-orange-50    border-orange-200   text-orange-800   dark:bg-orange-950/30 dark:border-orange-700/30 dark:text-orange-100',
    svmem: 'bg-cyan-100     border-cyan-300     text-cyan-900     dark:bg-cyan-950/30   dark:border-cyan-800/30  dark:text-cyan-100',
    discontinued: 'bg-slate-200 border-slate-400 text-slate-700 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-200',
};

// ---------------------------------------------------------------------------
// THEME_CLASSES – standard UI element classes for light/dark mode
// ---------------------------------------------------------------------------
export const THEME_CLASSES = {
    // button / UI
    btn: 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-500',
    searchBar: 'bg-white border-slate-300 text-slate-900 placeholder-slate-500 caret-slate-900 dark:bg-slate-800 dark:border-yellow-200/40 dark:text-slate-100 dark:placeholder-slate-400',
    divider: 'bg-slate-300 dark:bg-slate-700',
    headerBorder: 'border-slate-300 dark:border-slate-700',
    tilehover: 'hover:brightness-95 dark:hover:brightness-110',
    label: 'text-slate-500 dark:text-slate-500',
    focusRing: 'focus:ring-yellow-500/50 focus:border-yellow-400 dark:focus:ring-yellow-400/60 dark:focus:border-yellow-300',
    errorPanel: 'border-red-300 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30',
    errorText: 'text-red-700 dark:text-red-200',
    successText: 'text-emerald-700 dark:text-emerald-200',
    dotBg: 'bg-slate-400 dark:bg-slate-600',
    // sidebar / panels
    sidebar: 'bg-white border-slate-200 shadow-sm dark:bg-slate-800/80 dark:border-slate-700 dark:backdrop-blur-sm',
    sidebarHeader: 'border-slate-200 dark:border-slate-700/60',
    sidebarHeading: 'text-slate-600 dark:text-slate-400',
    card: 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700',
    cardAlt: 'bg-slate-50 border-slate-200 dark:bg-slate-900/60 dark:border-slate-700',
    mono: 'bg-slate-100 border-slate-300 text-slate-800 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-100',
    monoBtn: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500',
    bodyText: 'text-slate-700 dark:text-slate-200',
    mutedText: 'text-slate-600 dark:text-slate-400',
    dimText: 'text-slate-500 dark:text-slate-500',
    titleText: 'text-slate-900 dark:text-white',
    // section headings
    hBase: 'text-blue-700 dark:text-blue-400',
    hStandard: 'text-emerald-700 dark:text-emerald-400',
    hBit: 'text-purple-700 dark:text-purple-400',
    hAtomics: 'text-amber-700 dark:text-amber-400',
    hCompress: 'text-indigo-700 dark:text-indigo-400',
    hFloat: 'text-pink-700 dark:text-pink-400',
    hVector: 'text-sky-700 dark:text-sky-400',
    hInteger: 'text-fuchsia-700 dark:text-fuchsia-300',
    hVectorCrypto: 'text-teal-700 dark:text-teal-400',
    hSecurity: 'text-red-700 dark:text-red-400',
    hCrypto: 'text-slate-700 dark:text-slate-400',
    hVCrypto: 'text-violet-700 dark:text-violet-300',
    hSystem: 'text-orange-700 dark:text-orange-400',
    hCaches: 'text-orange-600 dark:text-orange-200',
    hS: 'text-cyan-700 dark:text-cyan-400',
    hSmem: 'text-cyan-600 dark:text-cyan-300',
    hSint: 'text-violet-700 dark:text-violet-300',
    // modal
    modal: 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700',
    modalInput: 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500',
    modalBtn: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500',
    validateBtn: 'border-yellow-400 bg-yellow-50 text-yellow-700 hover:border-yellow-500 dark:border-yellow-500/50 dark:bg-yellow-500/10 dark:text-yellow-200 dark:hover:border-yellow-400',
    emptyPanel: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400',
    proposalPanel: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
    conflictRow: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50',
    conflictBadge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600',
    conflictText: 'text-slate-600 dark:text-slate-300',
    conflictMeta: 'text-slate-500 dark:text-slate-400',
    profileBoxYes: 'bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700/30 dark:text-yellow-200',
    profileBoxNo: 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500',
};
