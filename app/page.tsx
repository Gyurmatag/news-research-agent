import { Chat } from "@/components/news/chat";

export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight">News Research Agent</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Sonnet 4.6 + Tavily
            </span>
          </div>
          <a
            className="text-xs text-muted-foreground hover:text-foreground"
            href="https://github.com/Gyurmatag/news-research-agent"
            target="_blank"
            rel="noreferrer"
          >
            github
          </a>
        </div>
      </header>
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
        <Chat />
      </div>
    </main>
  );
}
