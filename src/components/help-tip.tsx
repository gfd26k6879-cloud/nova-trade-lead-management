type HelpTipProps = {
  children: string;
  side?: "left" | "right";
};

export function HelpTip({ children, side = "right" }: HelpTipProps) {
  return (
    <span className="help-tip" tabIndex={0} aria-label={children} title={children}>
      ?
      <span className={`help-tip__bubble help-tip__bubble--${side}`} role="tooltip">
        {children}
      </span>
    </span>
  );
}
