import arrowUpIcon from "@phosphor-icons/core/assets/regular/arrow-up.svg?raw";
import { useEffect, useState } from "hono/jsx";
import { PhosphorIcon } from "../components/phosphor-icon";

export default function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      setIsVisible(window.scrollY > 0);
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  const visibilityClassName = isVisible
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";

  return (
    <button
      aria-label="トップへ戻る"
      className={`btn btn-lg btn-secondary btn-circle fixed bottom-4 left-4 z-30 shadow-md transition-opacity duration-300 ease-out motion-reduce:transition-none ${visibilityClassName}`}
      onClick={() => {
        window.scrollTo({ behavior: "smooth", top: 0 });
      }}
      tabIndex={isVisible ? 0 : -1}
      type="button"
    >
      <PhosphorIcon
        className="inline-flex shrink-0 [&_svg]:size-5"
        svg={arrowUpIcon}
      />
    </button>
  );
}
