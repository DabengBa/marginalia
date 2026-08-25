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
  accentFg: string;
  accentSubtle: string;
  bgBase: string;
  bgSubtle: string;
  bgMuted: string;
  bgElevated: string;
  fgBase: string;
  fgMuted: string;
  fgSubtle: string;
  borderDefault: string;
  borderStrong: string;
  danger: string;
  warning: string;
  fontSans: string;
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
    accentFg: rgb("--accent-fg"),
    accentSubtle: rgb("--accent-subtle"),
    bgBase: rgb("--bg-base"),
    bgSubtle: rgb("--bg-subtle"),
    bgMuted: rgb("--bg-muted"),
    bgElevated: rgb("--bg-elevated"),
    fgBase: rgb("--fg-base"),
    fgMuted: rgb("--fg-muted"),
    fgSubtle: rgb("--fg-subtle"),
    borderDefault: rgb("--border-default"),
    borderStrong: rgb("--border-strong"),
    danger: rgb("--danger"),
    warning: rgb("--warning"),
    fontSans: cs.getPropertyValue("--font-sans").trim(),
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
      colorLink: palette.accent,
      colorPrimaryText: palette.accent,
      colorPrimaryBg: palette.accentSubtle,
      colorBgContainer: palette.bgBase,
      colorBgContainerDisabled: palette.bgMuted,
      colorBgElevated: palette.bgElevated,
      colorBgLayout: palette.bgSubtle,
      colorFill: palette.bgMuted,
      colorFillSecondary: palette.bgMuted,
      colorFillTertiary: palette.bgSubtle,
      colorText: palette.fgBase,
      colorTextSecondary: palette.fgMuted,
      colorTextTertiary: palette.fgSubtle,
      colorTextDisabled: palette.fgSubtle,
      colorBorder: palette.borderDefault,
      colorBorderSecondary: palette.borderDefault,
      colorError: palette.danger,
      colorWarning: palette.warning,
      fontFamily: palette.fontSans,
      borderRadius: 8,
    },
    components: {
      Button: {
        defaultBg: palette.bgBase,
        defaultColor: palette.fgBase,
        defaultBorderColor: palette.borderDefault,
        defaultHoverBg: palette.bgMuted,
        defaultHoverColor: palette.fgBase,
        defaultHoverBorderColor: palette.borderStrong,
        defaultActiveBg: palette.bgSubtle,
        defaultActiveColor: palette.fgBase,
        defaultActiveBorderColor: palette.borderStrong,
        textTextColor: palette.fgMuted,
        textTextHoverColor: palette.fgBase,
        textTextActiveColor: palette.fgBase,
        primaryColor: palette.accentFg,
        defaultShadow: "none",
        primaryShadow: "none",
        dangerShadow: "none",
      },
      Collapse: {
        headerBg: palette.bgSubtle,
        contentBg: palette.bgBase,
      },
      Modal: {
        headerBg: palette.bgElevated,
        contentBg: palette.bgElevated,
        footerBg: palette.bgElevated,
        titleColor: palette.fgBase,
      },
      Segmented: {
        trackBg: palette.bgMuted,
        itemColor: palette.fgMuted,
        itemHoverColor: palette.fgBase,
        itemHoverBg: palette.bgSubtle,
        itemActiveBg: palette.bgSubtle,
        itemSelectedBg: palette.bgBase,
        itemSelectedColor: palette.fgBase,
      },
    },
  };
}
