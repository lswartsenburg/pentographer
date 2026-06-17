function PentographerMark({
  size = 64,
  theme = "dark",
}: {
  size?: number;
  theme?: "dark" | "light";
}) {
  const tile = theme === "dark" ? "#080E1A" : "#FFFFFF";
  const nibTop = theme === "dark" ? "#C8D8EE" : "#1E4A8A";
  const nibBot = theme === "dark" ? "#6A8DB8" : "#0F2D5E";
  const cut = tile;
  const accent = theme === "dark" ? "#22D3EE" : "#0891B2";
  const stroke = theme === "dark" ? "#8AAECC" : "#2A60A0";
  const id = `ng-${theme}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={id} x1="120" y1="50" x2="120" y2="178" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={nibTop} />
          <stop offset="100%" stopColor={nibBot} />
        </linearGradient>
      </defs>

      {/* Tile background */}
      <rect width="240" height="240" rx="52" fill={tile} />

      {/* Nib body — outer silhouette */}
      <path
        d="M 120 178 L 164 88 C 167 72, 158 52, 148 50 L 130 50 L 120 62 L 110 50 L 92 50 C 82 52, 73 72, 76 88 Z"
        fill={`url(#${id})`}
        stroke={stroke}
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Tine slit — cut from tip up to breather hole */}
      <line x1="120" y1="95" x2="120" y2="177" stroke={cut} strokeWidth="3" />

      {/* Breather hole — diamond */}
      <path d="M 120 82 L 128 91 L 120 100 L 112 91 Z" fill={cut} />

      {/* Cyan active tip dot */}
      <circle cx="120" cy="169" r="3" fill={accent} opacity="0.85" />

      {/* Crosshair tick marks at shoulder level */}
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

      {/* Subtle vertical axis mark above V-notch */}
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

function LogoWordmark({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const pentoColor = theme === "dark" ? "#E2EBF8" : "#0F172A";
  const grapherColor = theme === "dark" ? "#22D3EE" : "#0891B2";
  const subtitleColor = theme === "dark" ? "#4A6180" : "#94A3B8";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <PentographerMark size={64} theme={theme} />
      <div>
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          <span style={{ color: pentoColor }}>Pento</span>
          <span style={{ color: grapherColor }}>grapher</span>
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: subtitleColor,
            marginTop: 6,
          }}
        >
          Security Audit Platform
        </div>
      </div>
    </div>
  );
}

function SizeRow({ theme }: { theme: "dark" | "light" }) {
  const labelColor = theme === "dark" ? "#2E4A68" : "#94A3B8";
  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-end" }}>
      {[256, 128, 64, 32, 16].map((s) => (
        <div
          key={s}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
        >
          <PentographerMark size={s} theme={theme} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: labelColor,
              letterSpacing: "0.08em",
            }}
          >
            {s}px
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({
  label,
  background,
  labelColor,
  borderColor,
  children,
}: {
  label: string;
  background: string;
  labelColor: string;
  borderColor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background,
        borderRadius: 20,
        border: `1px solid ${borderColor}`,
        padding: "40px 48px",
        display: "flex",
        flexDirection: "column",
        gap: 40,
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: labelColor,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <div
      style={{
        background: "#040810",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 48,
        padding: "64px 48px",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Hero mark */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
        <PentographerMark size={160} theme="dark" />
        <LogoWordmark theme="dark" />
      </div>

      {/* Dark icon sizes */}
      <Section
        label="Dark — icon sizes"
        background="#080E1A"
        labelColor="#2E4A68"
        borderColor="#0F1E32"
      >
        <SizeRow theme="dark" />
      </Section>

      {/* Light variant */}
      <Section
        label="Light — icon sizes"
        background="#F0F5FC"
        labelColor="#94A3B8"
        borderColor="#DDE5F0"
      >
        <LogoWordmark theme="light" />
        <SizeRow theme="light" />
      </Section>
    </div>
  );
}
