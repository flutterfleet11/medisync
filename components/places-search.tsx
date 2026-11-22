"use client";

import { useState, useTransition } from "react";
import { MapPin, Navigation, Phone, Star } from "lucide-react";
import { searchPlacesAction } from "@/app/actions/integrations";
import { SourceBadge } from "@/components/status";
import { Button, EmptyState, Input, Notice, Skeleton, Spinner } from "@/components/ui";
import type { PlaceKind, PlacesResult } from "@/lib/integrations/serpapi";

export function PlacesSearch({
  kind,
  defaultQuery,
  compact = false,
  origin = null,
}: {
  kind: PlaceKind;
  defaultQuery: string;
  compact?: boolean;
  /** Default search origin (e.g. the prescribing clinic) until "Near me" is used. */
  origin?: { lat: number; lng: number } | null;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [result, setResult] = useState<PlacesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [pending, start] = useTransition();

  const run = (q = query, c = coords) => {
    setError(null);
    start(async () => {
      try {
        const res = await searchPlacesAction(kind, q, c ?? origin);
        if (res.ok && res.data) setResult(res.data);
        else if (!res.ok) setError(res.error);
      } catch {
        setError("Network error — please try again.");
      }
    });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setLocating(false);
        run(query, c);
      },
      () => {
        setLocating(false);
        setError("Location permission denied — searching near the clinic instead.");
      },
      { timeout: 8000 },
    );
  };

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === "pharmacy" ? "e.g. pharmacy, 24 hour chemist" : "e.g. pediatric clinic"}
          aria-label="Search query"
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} variant="teal">
            {pending ? <Spinner /> : null}
            Search
          </Button>
          <Button type="button" variant="secondary" onClick={locate} disabled={locating || pending} title="Use my current location">
            {locating ? <Spinner /> : <MapPin className="h-4 w-4" />}
            {coords ? "Near me ✓" : "Near me"}
          </Button>
        </div>
      </form>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {pending && !result ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : null}

      {result ? (
        <div className={pending ? "opacity-60" : ""}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SourceBadge provider="SerpApi" source={result.source} />
            {result.notice ? <span className="text-xs text-slate-500">{result.notice}</span> : null}
          </div>
          {result.places.length === 0 ? (
            <EmptyState title="No places found" description="Try a broader search term or another location." />
          ) : (
            <ul className={compact ? "divide-y divide-slate-100 rounded-lg border border-slate-200" : "grid gap-3 sm:grid-cols-2"}>
              {result.places.map((p) => (
                <li key={p.id} className={compact ? "p-3" : "rounded-lg border border-slate-200 bg-white p-4"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900">{p.name}</p>
                      {p.address ? <p className="mt-0.5 text-sm text-slate-500">{p.address}</p> : null}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {p.rating != null ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {p.rating}
                            {p.reviews != null ? ` (${p.reviews})` : ""}
                          </span>
                        ) : null}
                        {p.type ? <span>{p.type}</span> : null}
                        {p.openState ? <span>{p.openState}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.source === "live" ? (
                      <>
                        <a href={p.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100">
                          <Navigation className="h-3 w-3" /> Directions
                        </a>
                        <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                          <MapPin className="h-3 w-3" /> Map
                        </a>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Sample entry — no navigation</span>
                    )}
                    {p.phone ? (
                      <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                        <Phone className="h-3 w-3" /> {p.phone}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
