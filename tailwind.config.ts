import type { Config } from "tailwindcss";

const color = (token: string) =>
  `color-mix(in oklab, var(${token}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			border: color("--border"),
  			input: color("--input"),
  			ring: color("--ring"),
  			background: color("--background"),
  			foreground: color("--foreground"),
  			primary: {
  				DEFAULT: color("--primary"),
  				foreground: color("--primary-foreground"),
  			},
  			secondary: {
  				DEFAULT: color("--secondary"),
  				foreground: color("--secondary-foreground"),
  			},
  			destructive: {
  				DEFAULT: color("--destructive"),
  				foreground: color("--destructive-foreground"),
  			},
  			muted: {
  				DEFAULT: color("--muted"),
  				foreground: color("--muted-foreground"),
  			},
  			accent: {
  				DEFAULT: color("--accent"),
  				foreground: color("--accent-foreground"),
  			},
  			popover: {
  				DEFAULT: color("--popover"),
  				foreground: color("--popover-foreground"),
  			},
  			card: {
  				DEFAULT: color("--card"),
  				foreground: color("--card-foreground"),
  			},
  			sidebar: {
  				DEFAULT: color("--sidebar-background"),
  				foreground: color("--sidebar-foreground"),
  				primary: color("--sidebar-primary"),
  				"primary-foreground": color("--sidebar-primary-foreground"),
  				accent: color("--sidebar-accent"),
  				"accent-foreground": color("--sidebar-accent-foreground"),
  				hover: color("--sidebar-hover"),
  				border: color("--sidebar-border"),
  				ring: color("--sidebar-ring"),
  			},
  			chart: {
  				"1": color("--chart-1"),
  				"2": color("--chart-2"),
  				"3": color("--chart-3"),
  				"4": color("--chart-4"),
  				"5": color("--chart-5"),
  			},
  		},
  		borderRadius: {
  			xl: 'calc(var(--radius) + 4px)',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			sans: [
  				'var(--font-sans)'
  			],
  			serif: [
  				'var(--font-serif)'
  			],
  			mono: [
  				'var(--font-mono)'
  			]
  		},
  		boxShadow: {
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			DEFAULT: 'var(--shadow)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		},
  		letterSpacing: {
  			tighter: 'calc(var(--tracking-normal) - 0.05em)',
  			tight: 'calc(var(--tracking-normal) - 0.025em)',
  			normal: 'var(--tracking-normal)',
  			wide: 'calc(var(--tracking-normal) + 0.025em)',
  			wider: 'calc(var(--tracking-normal) + 0.05em)',
  			widest: 'calc(var(--tracking-normal) + 0.1em)'
  		},
  		maxWidth: {
  			page: '1440px'
  		},
  		keyframes: {
  			"fade-in-up": {
  				"0%": { opacity: "0", transform: "translateY(20px)" },
  				"100%": { opacity: "1", transform: "translateY(0)" },
  			},
  			"blob": {
  				"0%": { transform: "translate(0px, 0px) scale(1)" },
  				"33%": { transform: "translate(30px, -50px) scale(1.1)" },
  				"66%": { transform: "translate(-20px, 20px) scale(0.9)" },
  				"100%": { transform: "translate(0px, 0px) scale(1)" },
  			},
  			"marquee": {
  				"0%": { transform: "translateX(0%)" },
  				"100%": { transform: "translateX(-100%)" },
  			},
			orbit: {
				"0%": {
					transform:
						"rotate(calc(var(--angle) * 1deg)) translateY(calc(var(--radius) * 1px)) rotate(calc(var(--angle) * -1deg))",
				},
				"100%": {
					transform:
						"rotate(calc(var(--angle) * 1deg + 360deg)) translateY(calc(var(--radius) * 1px)) rotate(calc((var(--angle) * -1deg) - 360deg))",
				},
			},
			ripple: {
				"0%, 100%": { transform: "translate(-50%, -50%) scale(1)" },
				"50%": { transform: "translate(-50%, -50%) scale(0.9)" },
			},
			"voice-bar": {
				"0%, 100%": { transform: "scaleY(0.35)" },
				"50%": { transform: "scaleY(1)" },
			},
			"line-draw": {
				from: { strokeDashoffset: "1" },
				to: { strokeDashoffset: "0" },
			},
		},
		animation: {
			"fade-in-up": "fade-in-up 0.5s ease-out forwards",
			"blob": "blob 7s infinite",
			"marquee": "marquee 35s linear infinite",
			orbit: "orbit calc(var(--duration) * 1s) linear infinite",
			ripple: "ripple 2s ease calc(var(--i, 0) * 0.2s) infinite",
			"voice-bar": "voice-bar 1.1s ease-in-out infinite",
			"line-draw": "line-draw 2.8s ease-in-out infinite alternate",
		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
