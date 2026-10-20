import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: Date;
  defaultValue?: Date;
  onValueChange?: (value: Date | undefined) => void;
  label?: string;
  description?: string;
  errorMessage?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  dateFormat?: string;
  className?: string;
  classNames?: {
    base?: string;
    label?: string;
    trigger?: string;
    content?: string;
  };
}

function DatePicker(props: DatePickerProps) {
  const {
    value,
    defaultValue,
    onValueChange,
    label,
    description,
    errorMessage,
    placeholder = "Pick a date",
    required,
    disabled,
    dateFormat = "LLL dd, y",
    className,
    classNames,
  } = props;

  const generatedId = useId();
  const triggerId = generatedId;
  const descriptionId = description ? `${triggerId}-description` : undefined;
  const errorId = errorMessage ? `${triggerId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");
  const isControlled = "value" in props;
  const [internalValue, setInternalValue] = useState<Date | undefined>(defaultValue);
  const [open, setOpen] = useState(false);
  const selectedDate = isControlled ? value : internalValue;

  return (
    <Field className={cn("gap-1", [className, classNames?.base])}>
      {label && (
        <FieldLabel
          htmlFor={triggerId}
          isRequired={required}
          className={cn("", [classNames?.label])}
        >
          {label}
        </FieldLabel>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy || undefined}
            className={cn(
              "w-full justify-start text-left font-normal",
              !selectedDate && "text-muted-foreground",
              classNames?.trigger,
            )}
          >
            <CalendarIcon className="size-4" />
            {selectedDate ? format(selectedDate, dateFormat) : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className={cn("w-auto p-0", classNames?.content)}>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(nextDate) => {
              if (!isControlled) {
                setInternalValue(nextDate);
              }

              onValueChange?.(nextDate);

              if (nextDate) {
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>

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

function parseFormValue(value: unknown): Date | undefined {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

export interface DatePickerWithRHFProps<T extends FieldValues> extends Omit<
  DatePickerProps,
  "value" | "defaultValue" | "onValueChange" | "errorMessage"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: DatePickerWithRHFProps<T>) {
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
        <DatePicker
          {...rest}
          errorMessage={fieldState.error?.message}
          value={parseFormValue(field.value)}
          onValueChange={(next) => field.onChange(next ? next.toISOString() : "")}
        />
      )}
    />
  );
}

DatePicker.WithRHF = WithRHF;

export { DatePicker };
export default DatePicker;
