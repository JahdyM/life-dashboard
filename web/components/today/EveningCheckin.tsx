"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";

type EveningData = {
  date: string;
  energy: string;
  wentWell: string;
  tomorrow: string;
  completedAt: string;
};

const ENERGY_OPTIONS = [
  { key: "low", label: "Baixa", emoji: "🌙" },
  { key: "steady", label: "Ok", emoji: "🕯️" },
  { key: "bright", label: "Boa", emoji: "✨" },
];

export default function EveningCheckin() {
  const today = new Date().toISOString().slice(0, 10);
  const currentHour = new Date().getHours();
  const [energy, setEnergy] = useState("");
  const [wentWell, setWentWell] = useState("");
  const [tomorrow, setTomorrow] = useState("");
  const [done, setDone] = useState<EveningData | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [earned, setEarned] = useState(0);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const query = useQuery({
    queryKey: ["evening-checkin", today],
    queryFn: () => fetchJson<{ data: EveningData | null }>(`/api/checkin/evening?date=${today}`),
  });

  useEffect(() => {
    if (query.data?.data) setDone(query.data.data);
  }, [query.data]);

  useEffect(() => {
    if (energy && !done) setTimeout(() => firstInputRef.current?.focus(), 60);
  }, [done, energy]);

  const saveMut = useMutation({
    mutationFn: (payload: { date: string; energy: string; wentWell: string; tomorrow: string }) =>
      fetchJson<{ ok: boolean; data: EveningData; points: number; earned: number }>("/api/checkin/evening", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (payload) => {
      setDone(payload.data);
      if (typeof payload.earned === "number") setEarned(payload.earned);
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 3000);
    },
  });

  if (query.isPending) return null;
  if (!done && currentHour < 18) return null;

  if (done) {
    const option = ENERGY_OPTIONS.find((item) => item.key === done.energy);
    return (
      <section className={`today-panel evening-checkin-card compact-done${celebrating ? " celebrating" : ""}`}>
        <div>
          <p className="panel-kicker">Evening</p>
          <h2>
            {celebrating && earned > 0
              ? `🌙 +${earned} pts! Dia fechado`
              : option
                ? `${option.emoji} ${option.label}`
                : "Closed"}
          </h2>
        </div>
        <p>{done.tomorrow}</p>
      </section>
    );
  }

  const canSave = Boolean(energy && wentWell.trim() && tomorrow.trim());
  const submit = () => {
    if (!canSave) return;
    saveMut.mutate({ date: today, energy, wentWell: wentWell.trim(), tomorrow: tomorrow.trim() });
  };

  return (
    <section className="today-panel evening-checkin-card">
      <div className="today-panel-head compact">
        <div>
          <p className="panel-kicker">Evening</p>
          <h2>Close the day</h2>
        </div>
      </div>

      <div className="evening-energy-options" aria-label="Energy tonight">
        {ENERGY_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={energy === option.key ? "active" : ""}
            onClick={() => setEnergy(option.key)}
          >
            <span>{option.emoji}</span>
            {option.label}
          </button>
        ))}
      </div>

      <input
        ref={firstInputRef}
        value={wentWell}
        onChange={(event) => setWentWell(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && wentWell.trim()) {
            event.preventDefault();
            const next = event.currentTarget.nextElementSibling as HTMLInputElement | null;
            next?.focus();
          }
        }}
        placeholder="O que foi bem?"
      />
      <input
        value={tomorrow}
        onChange={(event) => setTomorrow(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Amanhã começa com..."
      />
      <p className="task-composer-hint">Enter saves.</p>
      {saveMut.isError ? <p className="form-error">Could not save.</p> : null}
    </section>
  );
}
