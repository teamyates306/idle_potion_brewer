// =============================================================================
// Shared inline icon set — replaces emoji throughout the live UI.
// Simple line icons, sized to ~1em so they drop into text flow like the
// emoji they replace. All use currentColor so they inherit surrounding
// text color (parchment/ink theme, no baked-in colors).
// =============================================================================
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";
import { Coins, User } from "lucide-react";

export type IconProps = SVGProps<SVGSVGElement>;
// Covers both our own Base()-wrapped icons and lucide-react's exported
// components (which are ForwardRefExoticComponents, not plain functions).
export type IconComponent = ComponentType<IconProps>;

// Coin and person icons are already established elsewhere in the app
// (CoinCounter.tsx, RailBadge usages) via lucide-react — reuse those exact
// icons here instead of drawing new ones, so every coin/account reference
// in the game looks identical regardless of which file renders it.
export const IconCoin = withOverride("coin", Coins);
export const IconAccount = withOverride("account", User);

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block shrink-0 align-[-0.125em]"
      {...props}
    >
      {children}
    </svg>
  );
}

// Custom-art override: if a file exists at ICON_OVERRIDE_DIR/<name>.svg it is
// rendered instead of the built-in line-art fallback below. Checked at
// runtime via a plain <img> + onError (this is a static client-only app with
// no backend, so a real file-existence check isn't available — the browser
// 404 tells us). Drop a same-named .svg into public/sprites/icons/ and it
// takes over immediately, no rebuild required. Used by the /map-editor
// "Icons" tab to preview and manage overrides.
export const ICON_OVERRIDE_DIR = "/sprites/icons/";


function Icon({ name, children, ...props }: IconProps & { name: string; children: React.ReactNode }) {
  const [customFailed, setCustomFailed] = useState(false);
  if (!customFailed) {
    return (
      <img
        src={`${ICON_OVERRIDE_DIR}${name}.svg`}
        width={(props.width as number | string | undefined) ?? "1em"}
        height={(props.height as number | string | undefined) ?? "1em"}
        className={`inline-block shrink-0 align-[-0.125em] ${props.className ?? ""}`}
        style={props.style}
        onError={() => setCustomFailed(true)}
        alt=""
      />
    );
  }
  return <Base {...props}>{children}</Base>;
}

function withOverride(name: string, Fallback: IconComponent): IconComponent {
  return function Overridable(props: IconProps) {
    const [customFailed, setCustomFailed] = useState(false);
    if (!customFailed) {
      return (
        <img
          src={`${ICON_OVERRIDE_DIR}${name}.svg`}
          width={(props.width as number | string | undefined) ?? "1em"}
          height={(props.height as number | string | undefined) ?? "1em"}
          className={`inline-block shrink-0 align-[-0.125em] ${props.className ?? ""}`}
          style={props.style}
          onError={() => setCustomFailed(true)}
          alt=""
        />
      );
    }
    return <Fallback {...props} />;
  };
}

export const IconGem = (p: IconProps) => (
  <Icon name="gem" {...p}>
    <path d="M4 9l3.5-5h9L20 9l-8 11-8-11z" />
    <path d="M4 9h16M9 4l3 5 3-5M8 9l4 11 4-11" />
  </Icon>
);

export const IconFlask = (p: IconProps) => (
  <Icon name="flask" {...p}>
    <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
    <path d="M7.5 15h9" />
  </Icon>
);

export const IconSparkle = (p: IconProps) => (
  <Icon name="sparkle" {...p}>
    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
  </Icon>
);

export const IconStarToken = (p: IconProps) => (
  <Icon name="token" {...p}>
    <path d="M12 2l2 7 7 1-5.2 4.8L17.5 22 12 18.3 6.5 22l1.7-7.2L3 10l7-1z" />
  </Icon>
);

export const IconReceipt = (p: IconProps) => (
  <Icon name="receipt" {...p}>
    <path d="M6 2h12v20l-2.5-1.5L13 22l-1.5-1.5L10 22l-2.5-1.5L6 22V2z" />
    <path d="M8.5 7h7M8.5 11h7M8.5 15h4" />
  </Icon>
);

export const IconBook = (p: IconProps) => (
  <Icon name="book" {...p}>
    <path d="M4 4.5C4 3.7 4.7 3 5.5 3H12v18H5.5c-.8 0-1.5-.7-1.5-1.5z" />
    <path d="M20 4.5c0-.8-.7-1.5-1.5-1.5H12v18h6.5c.8 0 1.5-.7 1.5-1.5z" />
  </Icon>
);

export const IconScroll = (p: IconProps) => (
  <Icon name="scroll" {...p}>
    <path d="M6 4a2 2 0 0 1 2-2h9a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    <path d="M17 2a2 2 0 0 1 2 2v2h-2M6 20a2 2 0 0 1-2-2v-2h2" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);

export const IconLeaf = (p: IconProps) => (
  <Icon name="leaf" {...p}>
    <path d="M20 4C10 4 4 10 4 18c8 0 14-6 14-14z" />
    <path d="M6 18C10 12 14 8 19 5" />
  </Icon>
);

export const IconWorker = (p: IconProps) => (
  <Icon name="worker" {...p}>
    <circle cx="12" cy="6.5" r="3" />
    <path d="M5 21v-3a4 4 0 0 1 4-4h1M19 21v-3a4 4 0 0 0-4-4h-1" />
    <path d="M12 14v7" />
  </Icon>
);

export const IconFactory = (p: IconProps) => (
  <Icon name="factory" {...p}>
    <path d="M3 21V11l5 3.5V11l5 3.5V9l6 4v8z" />
    <path d="M17 9V5l2 2V5" />
  </Icon>
);

export const IconMap = (p: IconProps) => (
  <Icon name="map" {...p}>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </Icon>
);

export const IconGlobe = (p: IconProps) => (
  <Icon name="globe" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 4 6 4 9s-1.5 6.3-4 9c-2.5-2.7-4-6-4-9s1.5-6.3 4-9z" />
  </Icon>
);

export const IconHorse = (p: IconProps) => (
  <Icon name="horse" {...p}>
    <path d="M6 21v-5l-2-2 1-6 4-3h5l3 3h2l1 2-2 1-1 3v3l1 4" />
    <path d="M13 5l3-2 1 3" />
  </Icon>
);

export const IconTrophy = (p: IconProps) => (
  <Icon name="trophy" {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
    <path d="M12 14v3M9 21h6M9.5 21c0-1.7.7-2.7 2.5-3s2.5 1.3 2.5 3" />
  </Icon>
);

export const IconSun = (p: IconProps) => (
  <Icon name="sun" {...p}>
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon name="check" {...p}>
    <path d="M4 12.5l5 5L20 6" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon name="close" {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Icon>
);

export const IconWarning = (p: IconProps) => (
  <Icon name="warning" {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 9.5v5" />
    <circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconSleep = (p: IconProps) => (
  <Icon name="sleep" {...p}>
    <path d="M6 9h6l-6 6h6" />
    <path d="M15 6h4l-4 4h4" />
  </Icon>
);

export const IconHammer = (p: IconProps) => (
  <Icon name="hammer" {...p}>
    <path d="M14.5 6.5l3-3 3 3-3 3M3 21l7.5-7.5M9 9l3 3-6.5 6.5-3-3z" />
  </Icon>
);

export const IconBox = (p: IconProps) => (
  <Icon name="box" {...p}>
    <path d="M3 8l9-5 9 5-9 5-9-5z" />
    <path d="M3 8v9l9 5 9-5V8M12 13v9" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon name="lock" {...p}>
    <rect x="5" y="11" width="14" height="10" rx="1.5" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);

export const IconPin = (p: IconProps) => (
  <Icon name="pin" {...p}>
    <path d="M12 22s7-7.5 7-12.5a7 7 0 0 0-14 0C5 14.5 12 22 12 22z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </Icon>
);

export const IconGear = (p: IconProps) => (
  <Icon name="gear" {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.5M12 19v2.5M4.5 12H2M22 12h-2.5M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6" />
  </Icon>
);

export const IconChartUp = (p: IconProps) => (
  <Icon name="chartUp" {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M20 20v-3" />
  </Icon>
);

export const IconNewspaper = (p: IconProps) => (
  <Icon name="newspaper" {...p}>
    <rect x="3" y="5" width="14" height="16" rx="1" />
    <path d="M6 9h8M6 12.5h8M6 16h5M17 8h4v10a3 3 0 0 1-3 3" />
  </Icon>
);

export const IconColumns = (p: IconProps) => (
  <Icon name="columns" {...p}>
    <path d="M3 21h18M4 21V10M8 21V10M12 21V10M16 21V10M20 21V10M2 10l10-6 10 6" />
  </Icon>
);

export const IconQuestion = (p: IconProps) => (
  <Icon name="question" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.3c.3-1.5 1.4-2.3 2.7-2.3 1.4 0 2.5.9 2.5 2.2 0 1.5-2.5 1.7-2.5 3.8" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconCrown = (p: IconProps) => (
  <Icon name="crown" {...p}>
    <path d="M4 19h16l-1.5-9-4 3.5L12 8l-2.5 5.5-4-3.5z" />
  </Icon>
);

export const IconWizardHat = (p: IconProps) => (
  <Icon name="wizardHat" {...p}>
    <path d="M4 19c3-11 6-16 8-16s5 5 8 16z" />
    <path d="M3 19h18" />
    <circle cx="12.5" cy="8.5" r="0.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconMedal = (p: IconProps) => (
  <Icon name="medal" {...p}>
    <path d="M8 3h8l-2.5 8h-3z" />
    <circle cx="12" cy="15" r="6" />
  </Icon>
);

export const IconMail = (p: IconProps) => (
  <Icon name="mail" {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M3.5 6.5l8.5 6 8.5-6" />
  </Icon>
);

export const IconHouse = (p: IconProps) => (
  <Icon name="house" {...p}>
    <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Icon>
);

export const IconIdea = (p: IconProps) => (
  <Icon name="idea" {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" />
  </Icon>
);

export const IconTarget = (p: IconProps) => (
  <Icon name="target" {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconOrb = (p: IconProps) => (
  <Icon name="orb" {...p}>
    <circle cx="12" cy="11" r="6.5" />
    <path d="M6.5 13.5c2 1.5 9 1.5 11 0M6 20h12" />
  </Icon>
);

export const IconMusic = (p: IconProps) => (
  <Icon name="music" {...p}>
    <path d="M9 18a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM19 16a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
    <path d="M11.5 15.5V5.5L21.5 4v10.5" />
  </Icon>
);

export const IconEye = (p: IconProps) => (
  <Icon name="eye" {...p}>
    <path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" />
  </Icon>
);

export const IconClover = (p: IconProps) => (
  <Icon name="clover" {...p}>
    <path d="M12 12c0-2.5-2-4.5-4.5-4.5S3 9.5 3 12s2 4.5 4.5 4.5S12 14.5 12 12z" />
    <path d="M12 12c0-2.5 2-4.5 4.5-4.5S21 9.5 21 12s-2 4.5-4.5 4.5S12 14.5 12 12z" />
    <path d="M12 12c-2.5 0-4.5-2-4.5-4.5S9.5 3 12 3s4.5 2 4.5 4.5S14.5 12 12 12z" />
    <path d="M12 12v9" />
  </Icon>
);

export const IconStrength = (p: IconProps) => (
  <Icon name="strength" {...p}>
    <path d="M3 10h2v4H3zM19 10h2v4h-2z" />
    <path d="M5 9v6M19 9v6" />
    <rect x="7" y="8" width="10" height="8" rx="1.5" />
  </Icon>
);

export const IconRun = (p: IconProps) => (
  <Icon name="run" {...p}>
    <circle cx="14" cy="4.5" r="1.7" />
    <path d="M11 8l3 2.5-1 4 4 3-1.5 4M14 10.5l-4 1-2.5-2.5M10 12.5L7 15l-2 5" />
  </Icon>
);

export const IconRibbon = (p: IconProps) => (
  <Icon name="ribbon" {...p}>
    <circle cx="12" cy="8" r="5" />
    <path d="M8.5 12L6 21l6-3 6 3-2.5-9" />
  </Icon>
);

export const IconRock = (p: IconProps) => (
  <Icon name="rock" {...p}>
    <path d="M4 16l3-7 5-3 5 2 3 5-2 6H6z" />
  </Icon>
);

export const IconCandle = (p: IconProps) => (
  <Icon name="candle" {...p}>
    <path d="M12 2s1.5 2 1.5 3.3S12 7 12 7s-1.5-.5-1.5-1.7S12 2 12 2z" />
    <rect x="9" y="7" width="6" height="14" rx="1" />
    <path d="M9 12h6" />
  </Icon>
);

export const IconScale = (p: IconProps) => (
  <Icon name="scale" {...p}>
    <path d="M12 3v18M8 21h8" />
    <path d="M5 7h6M13 7h6" />
    <path d="M5 7l-2.5 5a2.5 2.5 0 0 0 5 0zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0z" />
  </Icon>
);

export const IconFlame = (p: IconProps) => (
  <Icon name="flame" {...p}>
    <path d="M12 2c2 3-3 4-2 8 0-2 2-2 2-2 2 1 3 3 3 5a5 5 0 0 1-10 0c0-3 2-4 3-7 .3 1.5 1 2 1 2-1-3 1-4 3-6z" />
  </Icon>
);

export const IconDroplet = (p: IconProps) => (
  <Icon name="droplet" {...p}>
    <path d="M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z" />
  </Icon>
);

export const IconStopwatch = (p: IconProps) => (
  <Icon name="stopwatch" {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V9M10 2h4M12 2v2.5" />
  </Icon>
);

export const IconBolt = (p: IconProps) => (
  <Icon name="bolt" {...p}>
    <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
  </Icon>
);

export const IconThermometer = (p: IconProps) => (
  <Icon name="thermometer" {...p}>
    <path d="M12 3a2 2 0 0 0-2 2v9.5a4 4 0 1 0 4 0V5a2 2 0 0 0-2-2z" />
    <path d="M12 14v-6" />
  </Icon>
);

export const IconSpiral = (p: IconProps) => (
  <Icon name="spiral" {...p}>
    <path d="M12 12a2 2 0 1 0-2-2M12 12a4 4 0 1 1-4-4M12 12a6 6 0 1 0-6-6M12 12a8 8 0 1 1-8-8" />
  </Icon>
);

export const IconFootprints = (p: IconProps) => (
  <Icon name="footprints" {...p}>
    <ellipse cx="8" cy="8" rx="2" ry="3" />
    <ellipse cx="16" cy="14" rx="2" ry="3" />
    <path d="M6.5 12.5c0 1.5 1 2 1.5 2s1.5-.5 1.5-2M14.5 18.5c0 1.5 1 2 1.5 2s1.5-.5 1.5-2" />
  </Icon>
);

export const IconBackpack = (p: IconProps) => (
  <Icon name="backpack" {...p}>
    <path d="M7 8a5 5 0 0 1 10 0v1a4 4 0 0 1 2 3.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6.5A4 4 0 0 1 7 9z" />
    <path d="M9 6.5V11h6V6.5M9 14h6" />
  </Icon>
);

export const IconRocket = (p: IconProps) => (
  <Icon name="rocket" {...p}>
    <path d="M12 2c3 2 4 6 3.5 11-1 1.5-2 2-3.5 2s-2.5-.5-3.5-2C7.5 8 8.5 4 12 2z" />
    <path d="M9 13l-3 2 1-4M15 13l3 2-1-4M10.5 19l1.5 2 1.5-2" />
  </Icon>
);

export const IconRoad = (p: IconProps) => (
  <Icon name="road" {...p}>
    <path d="M9 3L4 21M15 3l5 18" />
    <path d="M12 6v2M12 11v2M12 16v2" />
  </Icon>
);

export const IconHandshake = (p: IconProps) => (
  <Icon name="handshake" {...p}>
    <path d="M2 12l4-3 4 2 3-2 3 2 4-2 2 3-3 5-3-1-2 2-3-2-2 2-3-2z" />
  </Icon>
);

export const IconChat = (p: IconProps) => (
  <Icon name="chat" {...p}>
    <path d="M4 5h16v10H9l-4 4v-4H4z" />
  </Icon>
);

export const IconMicroscope = (p: IconProps) => (
  <Icon name="microscope" {...p}>
    <path d="M9 21h8M11 21v-3.5M8 12l3-3 5 5-1.5 1.5a3.5 3.5 0 0 1-5 0z" />
    <path d="M13 8l2.5-2.5M18 3l-2 2 1.5 1.5 2-2z" />
  </Icon>
);

export const IconPetri = (p: IconProps) => (
  <Icon name="petri" {...p}>
    <ellipse cx="12" cy="12" rx="9" ry="5" />
    <ellipse cx="12" cy="10.5" rx="9" ry="5" />
    <circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="14" cy="11.5" r="0.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconMagnify = (p: IconProps) => (
  <Icon name="magnify" {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.5-4.5" />
  </Icon>
);

export const IconPuzzle = (p: IconProps) => (
  <Icon name="puzzle" {...p}>
    <path d="M9 4h4v2a2 2 0 1 0 0 4v-2h5v5h-2a2 2 0 1 0 0 4h2v5h-5v-2a2 2 0 1 0-4 0v2H4v-5h2a2 2 0 1 0 0-4H4V8h5z" />
  </Icon>
);

export const IconCompass = (p: IconProps) => (
  <Icon name="compass" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9l-2 5-5 2 2-5z" />
  </Icon>
);

export const IconChartBar = (p: IconProps) => (
  <Icon name="chartBar" {...p}>
    <path d="M4 20V13M10 20V7M16 20v-9M20 20H4" />
  </Icon>
);

export const IconStar = (p: IconProps) => (
  <Icon name="star" {...p}>
    <path d="M12 3.5l2.6 5.4 6 .8-4.3 4.2 1 6-5.3-2.9-5.3 2.9 1-6-4.3-4.2 6-.8z" />
  </Icon>
);

export const IconGraduation = (p: IconProps) => (
  <Icon name="graduation" {...p}>
    <path d="M2 9l10-4 10 4-10 4z" />
    <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6" />
  </Icon>
);

export const IconOwl = (p: IconProps) => (
  <Icon name="owl" {...p}>
    <path d="M12 3C7 3 4.5 6.5 4.5 11c0 4 1.5 8 2.5 9 .8-1 1.5-1.8 2-1.8M12 3c5 0 7.5 3.5 7.5 8 0 4-1.5 8-2.5 9-.8-1-1.5-1.8-2-1.8" />
    <circle cx="9" cy="11" r="1.6" />
    <circle cx="15" cy="11" r="1.6" />
    <path d="M12 12.5l-1 2h2z" />
  </Icon>
);

export const IconGroup = (p: IconProps) => (
  <Icon name="group" {...p}>
    <circle cx="8.5" cy="8" r="2.7" />
    <circle cx="16" cy="9" r="2.2" />
    <path d="M3.5 20v-1.5a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4V20M14.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h1a3.5 3.5 0 0 1 3.5 3.5v1" />
  </Icon>
);

export const IconHourglass = (p: IconProps) => (
  <Icon name="hourglass" {...p}>
    <path d="M6 3h12M6 21h12M7 3c0 5 3 6 5 8-2 2-5 3-5 8M17 3c0 5-3 6-5 8 2 2 5 3 5 8" />
  </Icon>
);

export const IconSnowflake = (p: IconProps) => (
  <Icon name="snowflake" {...p}>
    <path d="M12 2v20M4.5 6l15 12M19.5 6l-15 12" />
    <path d="M8 3.5L12 6l4-2.5M8 20.5L12 18l4 2.5M4 9l1 4-4 1M23 14l-4-1 1-4M4 15l1-4-4-1M23 10l-4 1 1 4" />
  </Icon>
);

export const IconMountain = (p: IconProps) => (
  <Icon name="mountain" {...p}>
    <path d="M3 20l6-11 4 6.5 2-3L21 20z" />
  </Icon>
);

export const IconWind = (p: IconProps) => (
  <Icon name="wind" {...p}>
    <path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 18h9a2 2 0 1 0-2-2" />
  </Icon>
);

export const IconVoid = (p: IconProps) => (
  <Icon name="void" {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconSkull = (p: IconProps) => (
  <Icon name="skull" {...p}>
    <path d="M6 11a6 6 0 0 1 12 0v4l1.5 2H16v2a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-2H4.5L6 15z" />
    <circle cx="9.5" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconExplosion = (p: IconProps) => (
  <Icon name="explosion" {...p}>
    <path d="M12 2l1.5 4.5L18 5l-2 4.5 4.5.5-3.5 3 3 3.5-4.5-.5L17 20l-4-2.5L11 22l-1-4.5L6 19l1.5-4.5L3 14l4-3L4 8l4.5 1.5L9 5z" />
  </Icon>
);

export const IconBubbles = (p: IconProps) => (
  <Icon name="bubbles" {...p}>
    <circle cx="9" cy="14" r="4" />
    <circle cx="16" cy="9" r="2.5" />
    <circle cx="16" cy="17" r="1.5" />
  </Icon>
);

export const IconGalaxy = (p: IconProps) => (
  <Icon name="galaxy" {...p}>
    <ellipse cx="12" cy="12" rx="9.5" ry="3.5" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconWilt = (p: IconProps) => (
  <Icon name="wilt" {...p}>
    <path d="M12 21V9" />
    <path d="M12 9c0-4-3-6-6-6 0 4 2 6 6 6zM12 9c0-3 2-5 5-5 0 3-1 5-5 5z" />
    <path d="M12 21c2-1 3-2 3-3" />
  </Icon>
);

export const IconGhost = (p: IconProps) => (
  <Icon name="ghost" {...p}>
    <path d="M5 21V11a7 7 0 0 1 14 0v10l-2.5-2-2 2-2.5-2-2 2-2.5-2z" />
    <circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="11" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconDna = (p: IconProps) => (
  <Icon name="dna" {...p}>
    <path d="M7 3c0 6 10 12 10 18M17 3c0 6-10 12-10 18" />
    <path d="M6 8h12M6 16H18" />
  </Icon>
);

export const IconTelescope = (p: IconProps) => (
  <Icon name="telescope" {...p}>
    <path d="M3 15l12-6 2 4-12 6z" />
    <path d="M17 13l4-2M11.5 12.5l2.5 5-3 1.5-2.5-5" />
    <circle cx="6" cy="17.5" r="2.2" />
  </Icon>
);

export const IconGloves = (p: IconProps) => (
  <Icon name="gloves" {...p}>
    <path d="M6 22v-8a3 3 0 0 1 3-3V6a1.5 1.5 0 0 1 3 0v5M12 11V4a1.5 1.5 0 0 1 3 0v7M15 11V6a1.5 1.5 0 0 1 3 0v6M18 12v-2a1.5 1.5 0 0 1 3 0v6a5 5 0 0 1-5 5H9a3 3 0 0 1-3-3" />
  </Icon>
);

export const IconAbacus = (p: IconProps) => (
  <Icon name="abacus" {...p}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 9h18M3 15h18" />
    <circle cx="8" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="14" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="10" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="7" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="13" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconVillage = (p: IconProps) => (
  <Icon name="village" {...p}>
    <path d="M3 21V13l4-3 4 3v8M4 13V9l3-2.5L10 9v4" />
    <path d="M12 21v-6l4.5-3.5L21 15v6z" />
  </Icon>
);

export const IconClipboard = (p: IconProps) => (
  <Icon name="clipboard" {...p}>
    <rect x="5" y="4" width="14" height="18" rx="1.5" />
    <rect x="9" y="2.5" width="6" height="3" rx="1" />
    <path d="M8 11h8M8 15h5" />
  </Icon>
);

/** String-key lookup for data files (achievements.ts, masteryTrees.ts, hints.ts, online/stats.ts). */
export const ICONS: Record<string, IconComponent> = {
  coin: IconCoin,
  account: IconAccount,
  gem: IconGem,
  flask: IconFlask,
  sparkle: IconSparkle,
  token: IconStarToken,
  receipt: IconReceipt,
  book: IconBook,
  scroll: IconScroll,
  leaf: IconLeaf,
  worker: IconWorker,
  factory: IconFactory,
  map: IconMap,
  globe: IconGlobe,
  horse: IconHorse,
  trophy: IconTrophy,
  sun: IconSun,
  check: IconCheck,
  close: IconClose,
  warning: IconWarning,
  sleep: IconSleep,
  hammer: IconHammer,
  box: IconBox,
  lock: IconLock,
  pin: IconPin,
  gear: IconGear,
  chartUp: IconChartUp,
  newspaper: IconNewspaper,
  columns: IconColumns,
  question: IconQuestion,
  crown: IconCrown,
  wizardHat: IconWizardHat,
  medal: IconMedal,
  mail: IconMail,
  house: IconHouse,
  idea: IconIdea,
  target: IconTarget,
  orb: IconOrb,
  music: IconMusic,
  eye: IconEye,
  clover: IconClover,
  strength: IconStrength,
  run: IconRun,
  ribbon: IconRibbon,
  rock: IconRock,
  candle: IconCandle,
  scale: IconScale,
  flame: IconFlame,
  droplet: IconDroplet,
  stopwatch: IconStopwatch,
  bolt: IconBolt,
  thermometer: IconThermometer,
  spiral: IconSpiral,
  footprints: IconFootprints,
  backpack: IconBackpack,
  rocket: IconRocket,
  road: IconRoad,
  handshake: IconHandshake,
  chat: IconChat,
  microscope: IconMicroscope,
  petri: IconPetri,
  magnify: IconMagnify,
  puzzle: IconPuzzle,
  village: IconVillage,
  clipboard: IconClipboard,
  compass: IconCompass,
  chartBar: IconChartBar,
  star: IconStar,
  graduation: IconGraduation,
  owl: IconOwl,
  group: IconGroup,
  hourglass: IconHourglass,
  snowflake: IconSnowflake,
  mountain: IconMountain,
  wind: IconWind,
  void: IconVoid,
  skull: IconSkull,
  explosion: IconExplosion,
  bubbles: IconBubbles,
  galaxy: IconGalaxy,
  wilt: IconWilt,
  ghost: IconGhost,
  dna: IconDna,
  telescope: IconTelescope,
  gloves: IconGloves,
  abacus: IconAbacus,
};
