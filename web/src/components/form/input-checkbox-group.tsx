import { useId, useMemo, useState } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import InputCheckbox from "@/components/form/input-checkbox";
import {
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";

type InputCheckboxGroupOption = {
  label: React.ReactNode;
  value: string;
  description?: React.ReactNode;
  disabled?: boolean;
};

export interface InputCheckboxGroupProps {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  options: InputCheckboxGroupOption[];
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
  classNames?: {
    base?: string;
    label?: string;
    description?: string;
    group?: string;
    item?: string;
    checkbox?: string;
    itemLabel?: string;
    itemDescription?: string;
    error?: string;
  };
}

function setValueChecked(values: string[], value: string, checked: boolean) {
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }

  return values.filter((item) => item !== value);
}

function InputCheckboxGroup(props: InputCheckboxGroupProps) {
  const {
    value,
    defaultValue = [],
    onValueChange,
    options,
    label,
    description,
    errorMessage,
    required,
    disabled,
    name,
    className,
    classNames,
  } = props;

  const generatedId = useId();
  const groupId = generatedId;
  const descriptionId = description ? `${groupId}-description` : undefined;
  const errorId = errorMessage ? `${groupId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValues = isControlled ? value : internalValue;

  return (
    <FieldSet
      aria-describedby={describedBy || undefined}
      aria-invalid={Boolean(errorMessage)}
      disabled={disabled}
      className={cn("gap-2", [className, classNames?.base])}
    >
      {label && (
        <FieldLegend variant="label" className={classNames?.label}>
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </FieldLegend>
      )}

      {description && (
        <FieldDescription id={descriptionId} className={classNames?.description}>
          {description}
        </FieldDescription>
      )}

      <FieldGroup data-slot="checkbox-group" className={cn("gap-3", classNames?.group)}>
        {options.map((option) => {
          const checked = selectedValues.includes(option.value);

          return (
            <InputCheckbox
              key={option.value}
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled || option.disabled}
              label={option.label}
              description={option.description}
              errorMessage={undefined}
              aria-invalid={Boolean(errorMessage)}
              onCheckedChange={(nextChecked) => {
                const nextValue = setValueChecked(
                  selectedValues,
                  option.value,
                  nextChecked === true,
                );

                if (!isControlled) {
                  setInternalValue(nextValue);
                }

                onValueChange?.(nextValue);
              }}
              className={classNames?.item}
              classNames={{
                checkbox: classNames?.checkbox,
                label: classNames?.itemLabel,
                description: classNames?.itemDescription,
              }}
            />
          );
        })}
      </FieldGroup>

      {errorMessage && (
        <FieldError id={errorId} className={cn("text-xs", classNames?.error)}>
          {errorMessage}
        </FieldError>
      )}
    </FieldSet>
  );
}

export interface InputCheckboxGroupWithRHFProps<T extends FieldValues> extends Omit<
  InputCheckboxGroupProps,
  "errorMessage" | "value" | "onValueChange"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputCheckboxGroupWithRHFProps<T>) {
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
        <InputCheckboxGroup
          errorMessage={fieldState.error?.message}
          {...rest}
          value={field.value as string[]}
          onValueChange={field.onChange}
        />
      )}
    />
  );
}

InputCheckboxGroup.WithRHF = WithRHF;

export default InputCheckboxGroup;
export { InputCheckboxGroup, type InputCheckboxGroupOption };
