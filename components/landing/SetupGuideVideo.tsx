"use client";

import { useMemo, useState } from "react";

type SetupGuideVideoProps = {
  /** YouTube watch/share URL or direct .mp4 URL. Empty = placeholder until set. */
  src: string;
  /** Optional poster for mp4; YouTube uses the default thumbnail until click. */
  poster?: string;
  title?: string;
};

function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

function isMp4(url: string): boolean {
  try {
    const path = new URL(url.trim()).pathname.toLowerCase();
    return path.endsWith(".mp4");
  } catch {
    return url.trim().toLowerCase().includes(".mp4");
  }
}

export default function SetupGuideVideo({
  src,
  poster,
  title = "ClinicBridge AI kurulum videosu",
}: SetupGuideVideoProps) {
  const [playing, setPlaying] = useState(false);
  const trimmed = src.trim();
  const ytId = useMemo(() => (trimmed ? youtubeId(trimmed) : null), [trimmed]);
  const mp4 = useMemo(() => (trimmed && !ytId ? isMp4(trimmed) : false), [trimmed, ytId]);

  if (!trimmed) {
    return (
      <div className="lp-setup-video lp-setup-video-empty" role="img" aria-label={title}>
        <p>Kurulum videosu yakında eklenecek.</p>
      </div>
    );
  }

  if (ytId) {
    const thumb = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    if (!playing) {
      return (
        <div className="lp-setup-video">
          <button
            type="button"
            className="lp-setup-video-facade"
            onClick={() => setPlaying(true)}
            aria-label={`${title} — oynat`}
          >
            {/* Thumbnail is a third-party YouTube asset; next/image domain allowlist is unnecessary here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" className="lp-setup-video-thumb" />
            <span className="lp-setup-video-play" aria-hidden>
              ▶
            </span>
          </button>
        </div>
      );
    }
    return (
      <div className="lp-setup-video">
        <iframe
          className="lp-setup-video-frame"
          src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  if (mp4) {
    return (
      <div className="lp-setup-video">
        <video className="lp-setup-video-el" controls preload="none" poster={poster} title={title}>
          <source src={trimmed} type="video/mp4" />
        </video>
      </div>
    );
  }

  return (
    <div className="lp-setup-video lp-setup-video-empty" role="status">
      <p>Video adresi tanınamadı. YouTube veya .mp4 bağlantısı kullanın.</p>
    </div>
  );
}
