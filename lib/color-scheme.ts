export const colorSchemes = ["violet", "hearth"] as const;

export type ColorScheme = (typeof colorSchemes)[number];

/**
 * Product palette. Light and dark still toggle on top of this.
 * "violet" is the current Custello theme. "hearth" is the warm cream and terracotta theme.
 */
export const colorScheme: ColorScheme = "violet";

export const colorSchemeClass: Record<ColorScheme, string> = {
  violet: "",
  hearth: "theme-hearth",
};
