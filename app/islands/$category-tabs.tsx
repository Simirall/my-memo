import { useEffect, useRef, useState } from "hono/jsx";
import type z from "zod";
import { FolderOpenIcon } from "@/components/folder-open-icon";
import type { categorySchema } from "@/features/categories/schema/category-schema";

type Category = Pick<z.infer<typeof categorySchema.read>, "id" | "name">;

type ScrollEdges = "none" | "left" | "right" | "both";

export default function CategoryTabs({
  categories,
  activeCategoryId,
}: {
  categories: ReadonlyArray<Category>;
  activeCategoryId: string | null;
}) {
  const tabsRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    dragged: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [scrollEdges, setScrollEdges] = useState<ScrollEdges>("none");
  const [isDragging, setIsDragging] = useState(false);

  const updateScrollEdges = () => {
    const tabs = tabsRef.current;
    if (!tabs) return;

    const canScrollLeft = tabs.scrollLeft > 1;
    const canScrollRight =
      tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1;
    setScrollEdges(
      canScrollLeft && canScrollRight
        ? "both"
        : canScrollLeft
          ? "left"
          : canScrollRight
            ? "right"
            : "none",
    );
  };

  useEffect(() => {
    if (CSS.supports("scroll-initial-target", "nearest")) return;
    tabsRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeCategoryId]);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;

    updateScrollEdges();
    const observer = new ResizeObserver(updateScrollEdges);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [categories.length]);

  const maskImage =
    scrollEdges === "both"
      ? "linear-gradient(to right, transparent, black 3rem, black calc(100% - 3rem), transparent)"
      : scrollEdges === "left"
        ? "linear-gradient(to right, transparent, black 3rem)"
        : scrollEdges === "right"
          ? "linear-gradient(to right, black calc(100% - 3rem), transparent)"
          : undefined;

  const endDrag = (pointerId: number) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    suppressClickRef.current = drag.dragged;
    dragRef.current = null;
    setIsDragging(false);
  };

  return (
    <div className="relative rounded-box bg-base-300/70 shadow backdrop-blur-sm">
      <nav
        aria-label="メモのカテゴリー"
        className={`tabs tabs-box flex-nowrap overflow-x-auto bg-transparent shadow-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_a]:cursor-inherit ${
          scrollEdges === "none"
            ? ""
            : isDragging
              ? "cursor-grabbing select-none"
              : "cursor-grab"
        }`}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragStart={(event: DragEvent) => event.preventDefault()}
        onPointerCancel={() => {
          suppressClickRef.current = false;
          dragRef.current = null;
          setIsDragging(false);
        }}
        onPointerDown={(event) => {
          const tabs = tabsRef.current;
          if (
            !tabs ||
            scrollEdges === "none" ||
            event.button !== 0 ||
            (event.pointerType !== "mouse" && event.pointerType !== "pen")
          )
            return;

          suppressClickRef.current = false;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: tabs.scrollLeft,
            dragged: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const tabs = tabsRef.current;
          if (!tabs || !drag || drag.pointerId !== event.pointerId) return;
          if ((event.buttons & 1) === 0) {
            dragRef.current = null;
            setIsDragging(false);
            return;
          }

          const distance = event.clientX - drag.startX;
          if (!drag.dragged && Math.abs(distance) < 4) return;
          if (!drag.dragged) {
            drag.dragged = true;
            tabs.setPointerCapture(event.pointerId);
            setIsDragging(true);
          }
          event.preventDefault();
          tabs.scrollLeft = drag.startScrollLeft - distance;
        }}
        onPointerUp={(event) => endDrag(event.pointerId)}
        onScroll={updateScrollEdges}
        ref={tabsRef}
        style={{
          maskImage,
          scrollbarWidth: "none",
          WebkitMaskImage: maskImage,
        }}
      >
        <a
          aria-current={activeCategoryId === null ? "page" : undefined}
          className={`tab shrink-0 whitespace-nowrap ${
            activeCategoryId === null
              ? "tab-active [scroll-initial-target:nearest]"
              : ""
          }`}
          href="/"
        >
          すべて
        </a>
        {categories.map((category) => {
          const isActive = category.id === activeCategoryId;

          return (
            <a
              aria-current={isActive ? "page" : undefined}
              className={`tab inline-flex shrink-0 items-center gap-1 whitespace-nowrap ${
                isActive ? "tab-active [scroll-initial-target:nearest]" : ""
              }`}
              href={`/categories/${category.id}`}
              key={category.id}
            >
              <FolderOpenIcon />
              {category.name}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
