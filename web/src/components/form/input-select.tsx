import { useId, useMemo } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type InputSelectOption = {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
};

export interface InputSelectProps extends React.ComponentProps<typeof Select> {
  label?: string;
  description?: string;
  errorMessage?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  options?: InputSelectOption[];
  startContent?: React.ReactNode;
  className?: string;
  classNames?: {
    base?: string;
    label?: string;
    trigger?: string;
    content?: string;
    item?: string;
  };
  children?: React.ReactNode;
}

function InputSelect(props: InputSelectProps) {
  const {
    label,
    description,
    errorMessage,
    placeholder,
    required,
    disabled,
    options,
    startContent,
    className,
    classNames,
    children,
    ...rest
  } = props;

  const generatedId = useId();
  const triggerId = generatedId;
  const descriptionId = description ? `${triggerId}-description` : undefined;
  const errorId = errorMessage ? `${triggerId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");

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

      <Select disabled={disabled} required={required} {...rest}>
        <SelectTrigger
          id={triggerId}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={describedBy || undefined}
          // pl-2 + gap-1.5 puts the value where InputText puts its text next to a start icon;
          // mr-auto keeps the value left-aligned instead of centred between icon and chevron.
          className={cn(
            "w-full",
            startContent && "pl-2 *:data-[slot=select-value]:mr-auto",
            classNames?.trigger,
          )}
        >
          {startContent && <span className="flex text-muted-foreground">{startContent}</span>}
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent className={classNames?.content}>
          {children ??
            options?.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={classNames?.item}
              >
                {option.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

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

export interface InputSelectWithRHFProps<T extends FieldValues> extends Omit<
  InputSelectProps,
  "errorMessage" | "value" | "onValueChange"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputSelectWithRHFProps<T>) {
  const { name, control, rules, ...rest } = props;

  const mergedRules = useMemo(() => {
    return {
      ...rules,
      ...(rest.required && { required: "This field is required" }),
    };
  }, [rules, rest.required]);

  return (
    <Controller
      control={control}
      name={name}
      rules={mergedRules}
      render={({ field, fieldState }) => (
        <InputSelect
          errorMessage={fieldState.error?.message}
          {...rest}
          value={field.value as string | undefined}
          onValueChange={field.onChange}
        />
      )}
    />
  );
}

InputSelect.WithRHF = WithRHF;

export default InputSelect;
export { InputSelect, type InputSelectOption };
