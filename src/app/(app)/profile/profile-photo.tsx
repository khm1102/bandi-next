"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/bandi/button";

/** 원본 profile.js: 사진 선택 → 업로드, 기본 아바타로 되돌리기. 서버가 형식·크기를 다시 검사한다. */
export function ProfilePhoto({ memberId, name, hasPhoto }: { memberId: number; name: string; hasPhoto: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("JPEG, PNG, WebP 파일을 5MB까지 올릴 수 있어요.");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [photo, setPhoto] = useState(hasPhoto);

  async function send(method: "PUT" | "DELETE", file?: File) {
    setBusy(true);
    try {
      const body = file ? new FormData() : undefined;
      if (body && file) body.set("file", file);
      const response = await fetch("/api/members/me/profile-photo", { method, body });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { message?: string } | null;
        setMessage(failure?.message ?? "사진을 바꾸지 못했어요.");
        return;
      }
      setPhoto(method === "PUT");
      setVersion((v) => v + 1);
      setMessage(method === "PUT" ? "프로필 사진을 바꿨어요." : "기본 아바타로 바꿨어요.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-b pb-6" aria-labelledby="profilePhotoTitle">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-3xl font-black text-primary-foreground">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="size-full object-cover" alt="" src={`/api/members/${memberId}/profile-photo?v=${version}`} />
          ) : (
            <span>{name.slice(0, 1)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="profilePhotoTitle" className="text-lg font-extrabold">프로필 사진</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">사진은 로그인한 동아리 멤버에게만 표시돼요. 외부 공개 화면에는 사용하지 않아요.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className={`${buttonClass("primary")} cursor-pointer`}>
              사진 선택
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                aria-label="프로필 사진 선택"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) await send("PUT", file);
                }}
              />
            </label>
            {photo ? (
              <button type="button" disabled={busy} className={buttonClass("outline")} onClick={() => send("DELETE")}>
                기본 아바타로 바꾸기
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground" role="status">{message}</p>
        </div>
      </div>
    </section>
  );
}
