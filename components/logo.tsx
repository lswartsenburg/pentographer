interface PentographerMarkProps {
  size?: number;
  theme?: "dark" | "light";
}

export function PentographerMark({ size = 64, theme = "light" }: PentographerMarkProps) {
  const tile = theme === "dark" ? "#080E1A" : "#185FA5";
  const nibTop = theme === "dark" ? "#C8D8EE" : "#ffffff";
  const nibBot = theme === "dark" ? "#6A8DB8" : "#bfdbfe";
  const cut = tile;
  const accent = theme === "dark" ? "#22D3EE" : "#ffffff";
  const stroke = theme === "dark" ? "#8AAECC" : "#93c5fd";
  const id = `ng-${theme}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pentographer logo mark"
    >
      <defs>
        <linearGradient id={id} x1="120" y1="50" x2="120" y2="178" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={nibTop} />
          <stop offset="100%" stopColor={nibBot} />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="52" fill={tile} />
      <path
        d="M 120 178 L 164 88 C 167 72, 158 52, 148 50 L 130 50 L 120 62 L 110 50 L 92 50 C 82 52, 73 72, 76 88 Z"
        fill={`url(#${id})`}
        stroke={stroke}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <line x1="120" y1="95" x2="120" y2="177" stroke={cut} strokeWidth="3" />
      <path d="M 120 82 L 128 91 L 120 100 L 112 91 Z" fill={cut} />
      <circle cx="120" cy="169" r="3" fill={accent} opacity="0.85" />
      <line
        x1="48"
        y1="88"
        x2="68"
        y2="88"
        stroke={accent}
        strokeWidth="2.5"
        strokeOpacity="0.65"
        strokeLinecap="round"
      />
      <line
        x1="172"
        y1="88"
        x2="192"
        y2="88"
        stroke={accent}
        strokeWidth="2.5"
        strokeOpacity="0.65"
        strokeLinecap="round"
      />
      <line
        x1="120"
        y1="32"
        x2="120"
        y2="46"
        stroke={accent}
        strokeWidth="2"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LogoWordmarkProps {
  theme?: "dark" | "light";
  size?: "sm" | "md" | "lg";
}

export function LogoWordmark({ theme = "light", size = "md" }: LogoWordmarkProps) {
  const markSize = size === "sm" ? 24 : size === "lg" ? 48 : 32;
  const fontSize = size === "sm" ? "text-base" : size === "lg" ? "text-3xl" : "text-xl";
  const pentoColor = theme === "dark" ? "text-slate-100" : "text-slate-900";
  const grapherColor = theme === "dark" ? "text-cyan-400" : "text-[#185FA5]";

  return (
    <div className="flex items-center gap-2.5">
      <PentographerMark size={markSize} theme={theme} />
      <span className={`font-bold tracking-tight leading-none ${fontSize}`}>
        <span className={pentoColor}>Pento</span>
        <span className={grapherColor}>grapher</span>
      </span>
    </div>
  );
}
