"use client";

import { Archive, ImagePlus, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";
import { FRAME, type MediaLayout } from "@/lib/media-layout";
import {
  DISPLAY_SECONDS,
  MEDIA_LIMITS,
  PLACEMENTS,
  PLACEMENT_LABEL,
  PLACEMENT_SPECS,
  checkDimensions,
  usesDisplaySeconds,
  type MediaType,
  type Placement,
} from "@/lib/placements";
import { CATEGORIES, CATEGORY_LABEL, TARGET_LIMITS, type Category, type Radius } from "@/lib/targeting";
import { FramePreview, MediaEditor, bakeImage, initialLayout, type EditorSource } from "./media-editor";

type Option = { id: string; name: string };
type AssetView = {
  id: string;
  kind: MediaType;
  url: string | null;
  width: number;
  height: number;
  durationMs: number | null;
};
type SourceView = { id: string; width: number; height: number };
type Status = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
type AdView = {
  id: string;
  title: string;
  sponsorId: string;
  placement: Placement;
  mediaType: MediaType;
  weight: number;
  displaySeconds: number | null;
  status: Status;
  startsAt: string | null;
  endsAt: string | null;
  layout: MediaLayout | null;
  category: string | null;
  targetCountries: string[];
  targetRegions: string[];
  targetCities: string[];
  targetRadius: Radius | null;
  targetStrict: boolean;
  asset: AssetView;
  source: SourceView | null;
};

/** "a, b ,," to ["a", "b"]. */
function splitList(value: string): string[] {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

/** ISO string to the value of a datetime-local input. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function readMediaSize(url: string, kind: MediaType): Promise<{ width: number; height: number; durationMs: number | null }> {
  return new Promise((resolve, reject) => {
    if (kind === "IMAGE") {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, durationMs: null });
      img.onerror = () => reject(new Error("Could not read this image."));
      img.src = url;
    } else {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, durationMs: Math.round(video.duration * 1000) });
      video.onerror = () => reject(new Error("Could not read this video."));
      video.src = url;
    }
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = url;
  });
}

/** Presigned upload, then the server checks the stored file and records it. */
async function uploadFile(body: Blob, filename: string, contentType: string, size: { width: number; height: number; durationMs: number | null }): Promise<AssetView> {
  const presign = await api<{ key: string; uploadUrl: string; headers: Record<string, string> }>("/api/media/presign", "POST", {
    filename,
    contentType,
    bytes: body.size,
  });
  if (!presign.ok) throw new Error(presign.error);
  const put = await fetch(presign.data.uploadUrl, { method: "PUT", headers: presign.data.headers, body });
  if (!put.ok) throw new Error("Upload failed.");
  const complete = await api<{ asset: AssetView }>("/api/media/complete", "POST", {
    key: presign.data.key,
    width: size.width,
    height: size.height,
    durationMs: size.durationMs,
  });
  if (!complete.ok) throw new Error(complete.error);
  return complete.data.asset;
}

type Editing = { source: EditorSource; layout: MediaLayout; file: File | null };

export function AdForm({ sponsors, ad }: { sponsors: Option[]; ad?: AdView }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(ad?.title ?? "");
  const [sponsorId, setSponsorId] = useState(ad?.sponsorId ?? sponsors[0]?.id ?? "");
  const [placement, setPlacement] = useState<Placement>(ad?.placement ?? "SCREEN_FOOTER");
  const [weight, setWeight] = useState(ad?.weight ?? 1);
  const [displaySeconds, setDisplaySeconds] = useState(ad?.displaySeconds ?? DISPLAY_SECONDS.default);
  const [startsAt, setStartsAt] = useState(toLocalInput(ad?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(ad?.endsAt ?? null));
  const [asset, setAsset] = useState<AssetView | null>(ad?.asset ?? null);
  const [source, setSource] = useState<SourceView | null>(ad?.source ?? null);
  const [layout, setLayout] = useState<MediaLayout | null>(ad?.layout ?? null);
  const [category, setCategory] = useState<string>(ad?.category ?? "");
  const [strict, setStrict] = useState(ad?.targetStrict ?? false);
  const [countries, setCountries] = useState((ad?.targetCountries ?? []).join(", "));
  const [regions, setRegions] = useState((ad?.targetRegions ?? []).join(", "));
  const [cities, setCities] = useState((ad?.targetCities ?? []).join(", "));
  const [radiusLat, setRadiusLat] = useState(ad?.targetRadius ? String(ad.targetRadius.lat) : "");
  const [radiusLon, setRadiusLon] = useState(ad?.targetRadius ? String(ad.targetRadius.lon) : "");
  const [radiusKm, setRadiusKm] = useState(ad?.targetRadius ? String(ad.targetRadius.km) : "");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | "archive" | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const status: Status = ad?.status ?? "DRAFT";
  const mediaType: MediaType = asset?.kind ?? "IMAGE";
  const spec = PLACEMENT_SPECS[placement];
  const showSeconds = usesDisplaySeconds(placement, mediaType);
  // A baked image has the frame's shape. An older upload may not: the editor fixes that.
  const sizeProblem = asset && asset.kind === "IMAGE" ? checkDimensions(placement, asset.width, asset.height) : null;
  const videoInPoster = placement === "POSTER_FOOTER" && asset?.kind === "VIDEO";

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const kind: MediaType | null = (MEDIA_LIMITS.IMAGE.mimes as readonly string[]).includes(file.type)
      ? "IMAGE"
      : (MEDIA_LIMITS.VIDEO.mimes as readonly string[]).includes(file.type)
        ? "VIDEO"
        : null;
    if (!kind) return setError("Only PNG, JPEG, WebP images and MP4 videos are allowed.");
    if (kind === "VIDEO" && placement === "POSTER_FOOTER") return setError("Video is not allowed in the poster footer.");
    const max = MEDIA_LIMITS[kind].maxBytes;
    if (file.size > max) return setError(`Too large: ${kind === "IMAGE" ? "images" : "videos"} are limited to ${max / 1024 / 1024} MB.`);
    const url = URL.createObjectURL(file);
    try {
      const size = await readMediaSize(url, kind);
      if (size.durationMs && size.durationMs > MEDIA_LIMITS.VIDEO.maxDurationMs) {
        throw new Error(`Videos can be at most ${MEDIA_LIMITS.VIDEO.maxDurationMs / 1000} seconds.`);
      }
      setEditing({ file, source: { kind, url, width: size.width, height: size.height }, layout: initialLayout(placement, size) });
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(e instanceof Error ? e.message : "Could not read this file.");
    }
  }

  /** Re-opens the editor on what is already uploaded: the original image when there is one, else the file itself. */
  function editCurrent() {
    if (!asset) return;
    setError(null);
    if (asset.kind === "IMAGE") {
      const from = source ?? asset;
      setEditing({
        file: null,
        source: { kind: "IMAGE", url: `/api/media/${from.id}/file`, width: from.width, height: from.height },
        layout: layout ?? initialLayout(placement, from),
      });
    } else if (asset.url) {
      setEditing({ file: null, source: { kind: "VIDEO", url: asset.url, width: asset.width, height: asset.height }, layout: layout ?? initialLayout(placement, asset) });
    }
  }

  function closeEditor() {
    if (editing?.file) URL.revokeObjectURL(editing.source.url);
    setEditing(null);
  }

  async function apply(next: MediaLayout, image: HTMLImageElement | null) {
    if (!editing) return;
    setUploading(true);
    setError(null);
    try {
      if (editing.source.kind === "IMAGE") {
        const img = image ?? (await loadImage(editing.source.url));
        const baked = await bakeImage(img, placement, next);
        const original = editing.file
          ? await uploadFile(editing.file, editing.file.name, editing.file.type, { width: editing.source.width, height: editing.source.height, durationMs: null })
          : null;
        const result = await uploadFile(baked, "ad.jpg", "image/jpeg", { ...FRAME[placement], durationMs: null });
        setAsset(result);
        if (original) setSource({ id: original.id, width: original.width, height: original.height });
        else if (!source) setSource(asset ? { id: asset.id, width: asset.width, height: asset.height } : null);
      } else {
        if (editing.file) {
          const size = { width: editing.source.width, height: editing.source.height, durationMs: Math.round((await readMediaSize(editing.source.url, "VIDEO")).durationMs ?? 0) };
          setAsset(await uploadFile(editing.file, editing.file.name, editing.file.type, size));
          setSource(null);
        }
      }
      setLayout(next);
      closeEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(next: "save" | "publish") {
    if (!asset) return setError("Upload the media first.");
    if (!formRef.current?.reportValidity()) return;
    const countryList = splitList(countries).map((c) => c.toUpperCase());
    const regionList = splitList(regions);
    const cityList = splitList(cities);
    if (countryList.some((c) => !/^[A-Z]{2}$/.test(c))) return setError("Countries are 2-letter codes, like IN, AE.");
    if ([countryList, regionList, cityList].some((l) => l.length > TARGET_LIMITS.items)) return setError(`At most ${TARGET_LIMITS.items} per list.`);
    if ([...regionList, ...cityList].some((v) => v.length > TARGET_LIMITS.itemLength)) return setError(`Each place is at most ${TARGET_LIMITS.itemLength} characters.`);
    const radiusParts = [radiusLat, radiusLon, radiusKm].map((v) => v.trim());
    const radiusFilled = radiusParts.filter(Boolean).length;
    if (radiusFilled > 0 && radiusFilled < 3) return setError("Radius needs latitude, longitude and km.");
    const targetRadius = radiusFilled === 3 ? { lat: Number(radiusParts[0]), lon: Number(radiusParts[1]), km: Number(radiusParts[2]) } : null;
    setBusy(next);
    setError(null);
    const body = {
      category: category || null,
      targetStrict: strict,
      targetCountries: countryList,
      targetRegions: regionList,
      targetCities: cityList,
      targetRadius,
      title,
      sponsorId,
      placement,
      mediaType: asset.kind,
      assetId: asset.id,
      sourceAssetId: asset.kind === "IMAGE" ? (source?.id ?? null) : null,
      layout,
      weight,
      displaySeconds: showSeconds ? displaySeconds : null,
      status: next === "publish" ? "ACTIVE" : status,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    };
    const result = ad ? await api(`/api/ads/${ad.id}`, "PATCH", body) : await api("/api/ads", "POST", body);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.push("/ads");
    router.refresh();
  }

  async function archive() {
    if (!ad) return;
    setBusy("archive");
    const result = await api(`/api/ads/${ad.id}`, "DELETE");
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.push("/ads");
    router.refresh();
  }

  if (sponsors.length === 0) {
    return (
      <EmptyState
        title="Add a sponsor first"
        action={
          <ButtonLink href="/sponsors" variant="outline" compact>
            Go to sponsors
          </ButtonLink>
        }
      />
    );
  }

  const blocked = Boolean(busy) || uploading || Boolean(editing) || Boolean(sizeProblem) || videoInPoster;

  return (
    <form
      ref={formRef}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void submit("save");
      }}
      className="space-y-4"
    >
      <Panel>
        <SectionHeader title="Details" actions={ad ? <StatusBadge status={status} size="sm" /> : undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} placeholder="e.g. Acme Sweets footer" />
          </Field>
          <Field label="Sponsor">
            <Select value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
              {sponsors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Placement">
            <Select
              value={placement}
              onChange={(e) => {
                setPlacement(e.target.value as Placement);
                setError(null);
              }}
            >
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>
                  {PLACEMENT_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="Media" />
        <p className="mb-3 text-xs text-muted-foreground">{spec.hint}</p>
        <FramePreview placement={placement} kind={mediaType} url={asset?.url ?? null} media={asset ?? { width: 1, height: 1 }} layout={layout} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className={`${buttonClass("outline", true)} cursor-pointer`}>
            <ImagePlus aria-hidden />
            {asset ? "Replace media" : "Upload media"}
            <input
              type="file"
              className="sr-only"
              accept={placement === "POSTER_FOOTER" ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,video/mp4"}
              onChange={pick}
            />
          </label>
          {asset ? (
            <Button compact variant="outline" icon={<Pencil />} onClick={editCurrent}>
              Edit
            </Button>
          ) : null}
          {uploading ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
        </div>
        <Modal open={Boolean(editing)} title="Edit media" onClose={closeEditor} busy={uploading}>
          {editing ? <MediaEditor placement={placement} source={editing.source} initial={editing.layout} busy={uploading} onApply={apply} onCancel={closeEditor} /> : null}
        </Modal>
        {sizeProblem ? <FeedbackBanner variant="warning" className="mt-3">{sizeProblem} Use Edit to fit it to the frame.</FeedbackBanner> : null}
        {videoInPoster ? <FeedbackBanner variant="warning" className="mt-3">Video is not allowed in the poster footer.</FeedbackBanner> : null}
      </Panel>

      <Panel>
        <SectionHeader title="Rotation and schedule" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Weight" hint="1 to 100. Higher shows more often.">
            <Input type="number" inputMode="numeric" min={1} max={100} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
          </Field>
          {showSeconds ? (
            <Field label="Seconds on screen" hint={`${DISPLAY_SECONDS.min} to ${DISPLAY_SECONDS.max}`}>
              <Input
                type="number"
                inputMode="numeric"
                min={DISPLAY_SECONDS.min}
                max={DISPLAY_SECONDS.max}
                value={displaySeconds}
                onChange={(e) => setDisplaySeconds(Number(e.target.value))}
              />
            </Field>
          ) : null}
          <Field label="Starts" hint="Optional">
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends" hint="Optional">
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="Relevance" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" hint="Shown more to viewers into it.">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">None</option>
              {CATEGORIES.map((c: Category) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
            Only show in these places
          </label>
          <Field label="Countries" hint="2-letter codes, comma separated. Empty is everywhere.">
            <Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="IN, AE" />
          </Field>
          <Field label="States / regions" hint="Comma separated.">
            <Input value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="Kerala, Karnataka" />
          </Field>
          <Field label="Cities" hint="Comma separated." className="sm:col-span-2">
            <Input value={cities} onChange={(e) => setCities(e.target.value)} placeholder="Kozhikode, Kochi" />
          </Field>
          <Field label="Latitude" hint="Optional radius.">
            <Input type="number" inputMode="decimal" step="any" min={-90} max={90} value={radiusLat} onChange={(e) => setRadiusLat(e.target.value)} />
          </Field>
          <Field label="Longitude">
            <Input type="number" inputMode="decimal" step="any" min={-180} max={180} value={radiusLon} onChange={(e) => setRadiusLon(e.target.value)} />
          </Field>
          <Field label="Radius (km)" hint={`${TARGET_LIMITS.radiusKm.min} to ${TARGET_LIMITS.radiusKm.max}`}>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min={TARGET_LIMITS.radiusKm.min}
              max={TARGET_LIMITS.radiusKm.max}
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      {error ? <FeedbackBanner variant="danger">{error}</FeedbackBanner> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {ad && status !== "ARCHIVED" ? (
          confirmArchive ? (
            <div className="flex gap-2 sm:mr-auto">
              <Button variant="destructive" onClick={archive} loading={busy === "archive"} disabled={busy !== null && busy !== "archive"}>
                Archive now
              </Button>
              <Button variant="ghost-muted" onClick={() => setConfirmArchive(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button variant="soft-destructive" onClick={() => setConfirmArchive(true)} disabled={Boolean(busy)} icon={<Archive />} className="sm:mr-auto">
              Archive
            </Button>
          )
        ) : null}
        <Button type="submit" variant="outline" loading={busy === "save"} disabled={blocked}>
          Save
        </Button>
        {status !== "ACTIVE" ? (
          <Button onClick={() => void submit("publish")} loading={busy === "publish"} disabled={blocked}>
            Publish
          </Button>
        ) : null}
      </div>
    </form>
  );
}
