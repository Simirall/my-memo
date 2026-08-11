import arrowLeftIcon from "@phosphor-icons/core/assets/regular/arrow-left.svg?raw";
import { PhosphorIcon } from "../components/phosphor-icon";

export default function PageBackButton() {
  return (
    <a
      aria-label="前のページに戻る"
      className="btn btn-lg btn-secondary btn-circle fixed bottom-4 left-4 z-30 shadow-md"
      href="/"
      onClick={(event) => {
        event.preventDefault();
        history.back();
      }}
    >
      <PhosphorIcon
        className="inline-flex shrink-0 [&_svg]:size-5"
        svg={arrowLeftIcon}
      />
    </a>
  );
}
