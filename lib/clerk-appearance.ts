import { shadcn } from "@clerk/themes";
import type { Theme } from "@clerk/types";

export const clerkAppearance: Theme = {
  baseTheme: shadcn,
  layout: {
    socialButtonsVariant: "blockButton",
  },
  variables: {
    colorBackground: "hsl(var(--card))",
    colorText: "hsl(var(--card-foreground))",
    colorTextSecondary: "hsl(var(--muted-foreground))",
    colorPrimary: "hsl(var(--primary))",
    colorTextOnPrimaryBackground: "hsl(var(--primary-foreground))",
    colorInputBackground: "hsl(var(--input))",
    colorInputText: "hsl(var(--card-foreground))",
    colorNeutral: "hsl(var(--foreground))",
    colorDanger: "hsl(var(--destructive))",
    borderRadius: "var(--radius)",
  },
  elements: {
    rootBox: "mx-auto w-full",
    card: "shadow-xl border border-border",
    headerTitle: "text-foreground text-xl font-semibold",
    headerSubtitle: "text-muted-foreground",
    socialButtons: "gap-3",
    socialButtonsBlockButton:
      "!h-11 !min-h-11 w-full !rounded-md !border-0 !bg-primary !px-4 !py-0 !text-primary-foreground !shadow-sm transition-all hover:!bg-primary/90 hover:!shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    socialButtonsBlockButtonText:
      "!text-sm !font-semibold !text-primary-foreground",
    socialButtonsProviderIcon: "!size-5",
    button:
      '[&[data-variant="outline"]]:!h-11 [&[data-variant="outline"]]:!min-h-11 [&[data-variant="outline"]]:!rounded-md [&[data-variant="outline"]]:!border-0 [&[data-variant="outline"]]:!bg-primary [&[data-variant="outline"]]:!text-primary-foreground [&[data-variant="outline"]]:!shadow-sm [&[data-variant="outline"]:hover]:!bg-primary/90',
    formButtonPrimary:
      "h-11 rounded-md bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.99]",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground",
    formFieldLabel: "text-foreground",
    formFieldInput:
      "h-11 rounded-md border-border bg-background text-foreground",
    footerActionText: "text-muted-foreground",
    footerActionLink: "text-primary font-medium hover:text-primary/80",
    identityPreviewText: "text-foreground",
    identityPreviewEditButton: "text-primary",
  },
};
