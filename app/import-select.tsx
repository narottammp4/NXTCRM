"use client";
import { Children, isValidElement, type ReactNode } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";

type Props = {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};
const emptyValue = "__nxtcall_placeholder__";
function choices(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (
      !isValidElement<{
        value?: string;
        disabled?: boolean;
        label?: string;
        children?: ReactNode;
      }>(child)
    )
      return null;
    const p = child.props;
    if (child.type === "optgroup")
      return (
        <SelectGroup key={index}>
          <SelectLabel>{p.label}</SelectLabel>
          {choices(p.children)}
        </SelectGroup>
      );
    if (child.type === "option") {
      const value = p.value === undefined ? String(p.children) : p.value;
      return (
        <SelectItem
          key={value || emptyValue}
          value={value || emptyValue}
          disabled={p.disabled}
        >
          {p.children}
        </SelectItem>
      );
    }
    return choices(p.children);
  });
}
/** Uses the same accessible dropdown as the rest of the CRM, including keyboard navigation. */
export default function ImportSelect({
  value,
  onChange,
  children,
  disabled,
  className,
  "aria-label": label = "Select option",
}: Props) {
  return (
    <Select
      value={value || emptyValue}
      disabled={disabled}
      onValueChange={(v) =>
        onChange({ target: { value: v === emptyValue ? "" : v } })
      }
    >
      <SelectTrigger
        className={"import-select " + (className || "")}
        aria-label={label}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className="import-select-menu"
        position="popper"
        align="start"
      >
        {choices(children)}
      </SelectContent>
    </Select>
  );
}
