import Image from "next/image";

export function Logo() {
  return (
    <div className="logo-lockup">
      <Image
        src="/brand/kora-app-icon.png"
        width={36}
        height={36}
        alt="Kora OS"
        className="logo-icon"
        priority
      />
      <span>Kora OS</span>
    </div>
  );
}
