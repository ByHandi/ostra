import { useId, useMemo, useState } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type InputComboboxMultipleOption = {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
  searchValue?: string;
};

export interface InputComboboxMultipleProps extends Omit<
  React.ComponentProps<typeof Combobox<InputComboboxMultipleOption, true>>,
  | "items"
  | "value"
  | "defaultValue"
  | "onValueChange"
  | "itemToStringLabel"
  | "itemToStringValue"
  | "isItemEqualToValue"
  | "multiple"
> {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  options: InputComboboxMultipleOption[];
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  placeholder?: string;
  emptyMessage?: React.ReactNode;
  className?: string;
  classNames?: {
    base?: string;
    label?: string;
    chips?: string;
    chip?: string;
    input?: string;
    content?: string;
    list?: string;
    item?: string;
  };
}

function getOptionText(option: InputComboboxMultipleOption) {
  if (option.searchValue) {
    return option.searchValue;
  }

  return typeof option.label === "string" ? option.label : option.value;
}

function getOptionsByValues(options: InputComboboxMultipleOption[], values: string[]) {
  return values
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is InputComboboxMultipleOption => Boolean(option));
}

function InputComboboxMultiple(props: InputComboboxMultipleProps) {
  const {
    value,
    defaultValue = [],
    onValueChange,
    options,
    label,
    description,
    errorMessage,
    placeholder = "Select options",
    emptyMessage = "No option found.",
    required,
    disabled,
    className,
    classNames,
    ...rest
  } = props;

  const generatedId = useId();
  const inputId = rest.id || generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValues = isControlled ? value : internalValue;
  const selectedOptions = useMemo(
    () => getOptionsByValues(options, selectedValues),
    [options, selectedValues],
  );

  return (
    <Field className={cn("gap-1", [className, classNames?.base])}>
      {label && (
        <FieldLabel htmlFor={inputId} isRequired={required} className={classNames?.label}>
          {label}
        </FieldLabel>
      )}

      <Combobox<InputComboboxMultipleOption, true>
        multiple
        items={options}
        value={selectedOptions}
        onValueChange={(nextOptions) => {
          const nextValue = nextOptions.map((option) => option.value);

          if (!isControlled) {
            setInternalValue(nextValue);
          }

          onValueChange?.(nextValue);
        }}
        itemToStringLabel={getOptionText}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(itemValue, currentValue) => itemValue.value === currentValue.value}
        required={required}
        disabled={disabled}
        {...rest}
      >
        <ComboboxChips
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={describedBy || undefined}
          className={classNames?.chips}
        >
          {selectedOptions.map((option) => (
            <ComboboxChip key={option.value} className={classNames?.chip}>
              {option.label}
            </ComboboxChip>
          ))}

          <ComboboxChipsInput
            id={inputId}
            placeholder={selectedOptions.length ? undefined : placeholder}
            disabled={disabled}
            className={classNames?.input}
          />
        </ComboboxChips>

        <ComboboxContent className={classNames?.content}>
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>

          <ComboboxList className={classNames?.list}>
            {(option: InputComboboxMultipleOption) => (
              <ComboboxItem
                key={option.value}
                value={option}
                disabled={option.disabled}
                className={classNames?.item}
              >
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

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

export interface InputComboboxMultipleWithRHFProps<T extends FieldValues> extends Omit<
  InputComboboxMultipleProps,
  "errorMessage" | "value" | "onValueChange"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputComboboxMultipleWithRHFProps<T>) {
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
        <InputComboboxMultiple
          errorMessage={fieldState.error?.message}
          {...rest}
          value={field.value as string[]}
          onValueChange={field.onChange}
        />
      )}
    />
  );
}

InputComboboxMultiple.WithRHF = WithRHF;

export default InputComboboxMultiple;
export { InputComboboxMultiple, type InputComboboxMultipleOption };
