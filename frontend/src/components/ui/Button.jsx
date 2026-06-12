import { buttonClasses } from "../../lib/uiClasses";
import Spinner from "./Spinner";

/**
 * Button primitive — variant + size từ lib/uiClasses (có test).
 *
 * @param {object} props
 * @param {"primary"|"secondary"|"danger"|"outline"|"success"} [props.variant]
 * @param {"sm"|"md"|"xl"} [props.size]
 * @param {boolean} [props.loading] - hiện spinner + disable
 * @param {import("react").ComponentType} [props.icon] - lucide icon component
 */
export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  className = "",
  disabled,
  children,
  ...props
}) {
  return (
    <button
      className={`${buttonClasses(variant, size)} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className={size === "xl" ? "h-5 w-5" : "h-4 w-4"} />}
      {!loading && Icon && (
        <Icon className={size === "xl" ? "w-6 h-6 flex-shrink-0" : "w-4 h-4 flex-shrink-0"} aria-hidden />
      )}
      {children}
    </button>
  );
}
