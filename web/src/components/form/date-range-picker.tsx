import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useId, useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  value?: DateRange;
  defaultValue?: DateRange;
  onValueChange?: (value: DateRange | undefined) => void;
  label?: string;
  description?: string;
  errorMessage?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  numberOfMonths?: number;
  dateFormat?: string;
  className?: string;
  classNames?: {
    base?: string;
    label?: string;
    trigger?: string;
    content?: string;
  };
}

function getDateRangeLabel({
  date,
  placeholder,
  dateFormat,
}: {
  date?: DateRange;
  placeholder: string;
  dateFormat: string;
}) {
  if (!date?.from) {
    return <span>{placeholder}</span>;
  }

  if (!date.to) {
    return format(date.from, dateFormat);
  }

  return `${format(date.from, dateFormat)} - ${format(date.to, dateFormat)}`;
}

function DateRangePicker(props: DateRangePickerProps) {
  const {
    value,
    defaultValue,
    onValueChange,
    label,
    description,
    errorMessage,
    placeholder = "Pick a date range",
    required,
    disabled,
    numberOfMonths = 2,
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
  const [internalValue, setInternalValue] = useState<DateRange | undefined>(defaultValue);
  const [open, setOpen] = useState(false);
  const [isSelectingRange, setIsSelectingRange] = useState(false);
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

      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);

          if (nextOpen) {
            setIsSelectingRange(false);
          }
        }}
      >
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
              !selectedDate?.from && "text-muted-foreground",
              classNames?.trigger,
            )}
          >
            <CalendarIcon className="size-4" />
            {getDateRangeLabel({ date: selectedDate, placeholder, dateFormat })}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className={cn("w-auto p-0", classNames?.content)}>
          <Calendar
            mode="range"
            numberOfMonths={numberOfMonths}
            selected={selectedDate}
            onSelect={(nextDate, triggerDate) => {
              const nextValue = isSelectingRange ? nextDate : { from: triggerDate, to: undefined };

              if (!isControlled) {
                setInternalValue(nextValue);
              }

              onValueChange?.(nextValue);

              if (!isSelectingRange) {
                setIsSelectingRange(true);
                return;
              }

              if (
                nextValue?.from &&
                nextValue.to &&
                nextValue.from.getTime() !== nextValue.to.getTime()
              ) {
                setIsSelectingRange(false);
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

export { DateRangePicker };
export default DateRangePicker;
