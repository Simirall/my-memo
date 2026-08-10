export const PhosphorIcon = ({
  svg,
  className = "inline-flex shrink-0 [&_svg]:size-4",
}: {
  svg: string;
  className?: string;
}) => (
  <span
    aria-hidden="true"
    className={className}
    dangerouslySetInnerHTML={{ __html: svg }}
  />
);
