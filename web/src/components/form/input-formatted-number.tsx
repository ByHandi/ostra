import { useId, useMemo, useState } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export interface InputFormattedNumberProps extends Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode"
> {
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (value: number | null) => void;
  label?: string;
  description?: string;
  errorMessage?: string;
  classNames?: {
    base?: string;
    label?: string;
    input?: string;
  };
  startContent?: React.ReactNode;
  endContent?: React.ReactNode;
  decimalSeparator?: "." | ",";
  groupingSeparator?: "." | "," | " " | "";
  maximumFractionDigits?: number;
  allowNegative?: boolean;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimFraction(fraction: string, maximumFractionDigits: number) {
  return maximumFractionDigits > 0 ? fraction.slice(0, maximumFractionDigits) : "";
}

function parseNumberInput({
  value,
  decimalSeparator,
  groupingSeparator,
  maximumFractionDigits,
  allowNegative,
}: {
  value: string;
  decimalSeparator: "." | ",";
  groupingSeparator: "." | "," | " " | "";
  maximumFractionDigits: number;
  allowNegative: boolean;
}) {
  let nextValue = value.trim();

  if (groupingSeparator) {
    nextValue = nextValue.replace(new RegExp(escapeRegExp(groupingSeparator), "g"), "");
  }

  const invalidCharacters = new RegExp(`[^0-9${escapeRegExp(decimalSeparator)}-]`, "g");
  nextValue = nextValue.replace(invalidCharacters, "");

  const isNegative = allowNegative && nextValue.startsWith("-");
  nextValue = nextValue.replace(/-/g, "");

  const hasDecimalSeparator = nextValue.includes(decimalSeparator) && maximumFractionDigits > 0;
  const [integer = "", ...fractions] = nextValue.split(decimalSeparator);
  const fraction = trimFraction(fractions.join(""), maximumFractionDigits);
  const normalized = `${isNegative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;

  if (!integer && !fraction) {
    return {
      numberValue: null,
      editableValue: `${isNegative ? "-" : ""}${hasDecimalSeparator ? decimalSeparator : ""}`,
    };
  }

  const numberValue = Number(normalized);

  return {
    numberValue: Number.isFinite(numberValue) ? numberValue : null,
    editableValue: `${isNegative ? "-" : ""}${integer}${hasDecimalSeparator ? `${decimalSeparator}${fraction}` : ""}`,
  };
}

function formatNumberValue({
  value,
  decimalSeparator,
  groupingSeparator,
  maximumFractionDigits,
}: {
  value: number | null | undefined;
  decimalSeparator: "." | ",";
  groupingSeparator: "." | "," | " " | "";
  maximumFractionDigits: number;
}) {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }

  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);
  const [integer = "0", fraction = ""] = absoluteValue
    .toFixed(maximumFractionDigits)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .split(".");
  const groupedInteger = groupingSeparator
    ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, groupingSeparator)
    : integer;

  return `${sign}${groupedInteger}${fraction ? `${decimalSeparator}${fraction}` : ""}`;
}

function InputFormattedNumber(props: InputFormattedNumberProps) {
  const {
    value,
    defaultValue,
    onValueChange,
    required,
    label,
    description,
    errorMessage,
    className,
    classNames,
    startContent,
    endContent,
    decimalSeparator = ",",
    groupingSeparator = ".",
    maximumFractionDigits = 2,
    allowNegative = false,
    onBlur,
    onFocus,
    ...rest
  } = props;

  const generatedId = useId();
  const inputId = rest.id || generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  const describedBy = [rest["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ");
  const ariaInvalid = rest["aria-invalid"] ?? Boolean(errorMessage);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<number | null>(defaultValue ?? null);
  const [isFocused, setIsFocused] = useState(false);
  const numberValue = isControlled ? value : internalValue;
  const [displayValue, setDisplayValue] = useState(() =>
    formatNumberValue({
      value: numberValue,
      decimalSeparator,
      groupingSeparator,
      maximumFractionDigits,
    }),
  );

  const formattedValue = formatNumberValue({
    value: numberValue,
    decimalSeparator,
    groupingSeparator,
    maximumFractionDigits,
  });
  const inputValue = isFocused ? displayValue : formattedValue;

  return (
    <Field className={cn("gap-1", [className, classNames?.base])}>
      {label && (
        <FieldLabel htmlFor={inputId} isRequired={required} className={cn("", [classNames?.label])}>
          {label}
        </FieldLabel>
      )}

      <InputGroup>
        {startContent && <InputGroupAddon align="inline-start">{startContent}</InputGroupAddon>}

        <InputGroupInput
          {...rest}
          id={inputId}
          type="text"
          required={required}
          inputMode="decimal"
          value={inputValue}
          aria-invalid={ariaInvalid}
          aria-describedby={describedBy || undefined}
          className={classNames?.input}
          onChange={(event) => {
            const parsedValue = parseNumberInput({
              value: event.target.value,
              decimalSeparator,
              groupingSeparator,
              maximumFractionDigits,
              allowNegative,
            });

            setDisplayValue(parsedValue.editableValue);

            if (!isControlled) {
              setInternalValue(parsedValue.numberValue);
            }

            onValueChange?.(parsedValue.numberValue);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            setDisplayValue(
              formatNumberValue({
                value: numberValue,
                decimalSeparator,
                groupingSeparator: "",
                maximumFractionDigits,
              }),
            );
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
        />

        {endContent && <InputGroupAddon align="inline-end">{endContent}</InputGroupAddon>}
      </InputGroup>

      {description && (
        <FieldDescription id={descriptionId} className="text-muted-foreground">
          {description}
        </FieldDescription>
      )}

      {errorMessage && (
        <FieldError id={errorId} className="text-xs">
          {errorMessage}
        </FieldError>
      )}
    </Field>
  );
}

export interface InputFormattedNumberWithRHFProps<T extends FieldValues> extends Omit<
  InputFormattedNumberProps,
  "errorMessage" | "value" | "onValueChange"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputFormattedNumberWithRHFProps<T>) {
  const { name, control, rules, ...rest } = props;

  const mergedRules = useMemo(() => {
    return {
      ...rules,
      ...(rest.required && { required: "Wajib diisi" }),
    };
  }, [rules, rest.required]);

  return (
    <Controller
      control={control}
      name={name}
      rules={mergedRules}
      render={({ field, fieldState }) => (
        <InputFormattedNumber
          errorMessage={fieldState.error?.message}
          {...rest}
          value={field.value as number | null}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

InputFormattedNumber.WithRHF = WithRHF;

export default InputFormattedNumber;
