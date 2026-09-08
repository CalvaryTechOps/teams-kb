import { GlobeIcon, UsersIcon, UsersPlusIcon } from "@/components/icons";
import { audienceLabel, type GuideAudience } from "@/lib/category-list";

// Who a guide is shared with, at a glance, to the left of its title in list
// rows: this team (group), other teams too (group with a plus), all staff
// (globe). The wrapper carries the label so screen readers hear it once;
// the SVG itself stays aria-hidden.
export function AudienceIcon({
  audience,
  size = 14,
  className = "",
}: {
  audience: GuideAudience;
  size?: number;
  className?: string;
}) {
  const label = audienceLabel(audience);
  const Icon =
    audience === "all_staff"
      ? GlobeIcon
      : audience === "groups"
        ? UsersPlusIcon
        : UsersIcon;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 text-grey-400 ${className}`}
    >
      <Icon size={size} />
    </span>
  );
}
