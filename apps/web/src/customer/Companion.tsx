import type { EnvironmentEmployee } from "@t3tools/contracts";
import { useState, type CSSProperties } from "react";

import {
  COMPANION_ANIMATIONS,
  companionLoops,
  companionSheetFits,
  companionSheetUrl,
  type CompanionAnimation,
} from "./companion.logic";
import { CustomerAvatar } from "./CustomerAvatar";

/**
 * An employee's companion acting out `animation`, drawn from the spritesheet the employee
 * profile links. Without one, or while it loads, or when it fails or is not a Petdex sheet, the
 * pixel robot stands in.
 */
export function Companion(props: {
  employee: EnvironmentEmployee | undefined;
  animation: CompanionAnimation;
  /** Width in pixels; the companion is a little taller than wide. */
  size: number;
  /** Picks the robot's colour when there is no companion. */
  seed: string;
  label?: string;
}) {
  const companion = props.employee?.companion;
  const url = companionSheetUrl(companion?.sheetUrl, window.location.href);
  const [loaded, setLoaded] = useState<{ url: string; fits: boolean } | null>(null);
  const ready = url !== null && loaded?.url === url && loaded.fits;

  if (!ready) {
    return (
      <>
        {url !== null && loaded?.url !== url ? (
          <img
            src={url}
            alt=""
            hidden
            onLoad={(event) =>
              setLoaded({
                url,
                fits: companionSheetFits(
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                  companion?.version ?? 1,
                ),
              })
            }
            onError={() => setLoaded({ url, fits: false })}
          />
        ) : null}
        <CustomerAvatar seed={props.seed} size={props.size} />
      </>
    );
  }

  const { row, frames, durationMs } = COMPANION_ANIMATIONS[props.animation];
  const style = {
    backgroundImage: `url(${JSON.stringify(url)})`,
    "--companion-width": `${props.size}px`,
    "--companion-row": row,
    "--companion-frames": frames,
    "--companion-duration": `${durationMs}ms`,
    "--companion-iterations": companionLoops(props.animation) ? "infinite" : 3,
  } as CSSProperties;
  return (
    <span
      key={props.animation}
      className="customer-companion"
      role={props.label === undefined ? undefined : "img"}
      aria-label={props.label}
      aria-hidden={props.label === undefined ? true : undefined}
      style={style}
    />
  );
}
