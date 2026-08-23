/** Bridge the app's Tailwind CSS-variable palette into an Ant Design theme.
 *
 *  Marginalia keeps its semantic palette in CSS variables that flip with the
 *  `.dark` class (see styles/globals.css). Ant Design has its own token model,
 *  so we read the resolved RGB values from `:root`/`.dark` and map them onto
 *  AntD tokens. This lets AntD components (buttons, tables, modals, form
 *  controls, …) inherit the same look-and-feel once we migrate to them.
 */
import { useEffect, useState } from "react";
import { theme as antdTheme, type ThemeConfig } from "antd";

import { useTheme } from "@/lib/theme";

interface Palette {
  accent: string;
  bgBase: string;
  bgSubtle: string;
  bgElevated: string;
  fgBase: string;
  fgMuted: string;
  borderDefault: string;
  danger: string;
  warning: string;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const rgb = (name: string) => {
    const v = cs.getPropertyValue(name).trim();
    // CSS vars hold space-separated RGB triplets, e.g. "79 70 229".
    return v ? `rgb(${v})` : "";
  };
  return {
    accent: rgb("--accent"),
    bgBase: rgb("--bg-base"),
    bgSubtle: rgb("--bg-subtle"),
    bgElevated: rgb("--bg-elevated"),
    fgBase: rgb("--fg-base"),
    fgMuted: rgb("--fg-muted"),
    borderDefault: rgb("--border-default"),
    danger: rgb("--danger"),
    warning: rgb("--warning"),
  };
}

/** Ant Design theme that follows the app's own light/dark toggle. */
export function useAntdTheme(): ThemeConfig {
  const effective = useTheme((s) => s.effective);
  const [palette, setPalette] = useState<Palette>(() => readPalette());

  // `.dark` is toggled by useTheme.init; re-read the resolved vars when the
  // effective mode flips so AntD colors track the app theme.
  useEffect(() => {
    setPalette(readPalette());
  }, [effective]);

  return {
    algorithm:
      effective === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.accent,
      colorInfo: palette.accent,
      colorBgContainer: palette.bgBase,
      colorBgElevated: palette.bgElevated,
      colorBgLayout: palette.bgSubtle,
      colorText: palette.fgBase,
      colorTextSecondary: palette.fgMuted,
      colorBorder: palette.borderDefault,
      colorError: palette.danger,
      colorWarning: palette.warning,
      borderRadius: 8,
    },
  };
}
