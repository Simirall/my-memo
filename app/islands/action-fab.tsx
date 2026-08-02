import globeIcon from "@phosphor-icons/core/assets/regular/globe.svg?raw";
import notePencilIcon from "@phosphor-icons/core/assets/regular/note-pencil.svg?raw";
import plusIcon from "@phosphor-icons/core/assets/regular/plus.svg?raw";
import xIcon from "@phosphor-icons/core/assets/regular/x.svg?raw";
import { PhosphorIcon } from "../components/phosphor-icon";

const fabLabelClassName =
  "badge whitespace-nowrap border-base-content bg-base-content text-base-100 shadow-sm";
const fabActionClassName =
  "btn btn-lg btn-circle border-base-content bg-base-content text-base-100 shadow-md hover:bg-base-content hover:text-base-100";

const FabIcon = ({ svg }: { svg: string }) => (
  <PhosphorIcon className="inline-flex shrink-0 [&_svg]:size-6" svg={svg} />
);

const FabAction = ({
  href,
  label,
  svg,
}: {
  href: string;
  label: string;
  svg: string;
}) => (
  <div>
    <span className={fabLabelClassName}>{label}</span>
    <a aria-label={label} className={fabActionClassName} href={href}>
      <FabIcon svg={svg} />
    </a>
  </div>
);

export const ActionFab = () => (
  <aside aria-label="Quick actions" className="fab">
    <button
      aria-label="Open quick actions"
      className="btn btn-primary btn-lg btn-circle"
      tabIndex={0}
      type="button"
    >
      <FabIcon svg={plusIcon} />
    </button>
    <div className="fab-close">
      <span className={fabLabelClassName}>Close</span>
      <button
        aria-label="Close quick actions"
        className="btn btn-error btn-lg btn-circle"
        onClick={() => {
          (document.activeElement as HTMLElement | null)?.blur();
        }}
        type="button"
      >
        <FabIcon svg={xIcon} />
      </button>
    </div>
    <FabAction href="/memos/create" label="Create Memo" svg={notePencilIcon} />
    <FabAction
      href="/memos/url-summary"
      label="Create WebPage Summary"
      svg={globeIcon}
    />
  </aside>
);
