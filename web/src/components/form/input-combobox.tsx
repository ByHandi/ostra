import { useId, useMemo } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type InputComboboxOption = {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
  searchValue?: string;
};

export interface InputComboboxProps extends Omit<
  React.ComponentProps<typeof Combobox<InputComboboxOption>>,
  | "items"
  | "value"
  | "defaultValue"
  | "onValueChange"
  | "itemToStringLabel"
  | "itemToStringValue"
  | "isItemEqualToValue"
  | "multiple"
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | undefined) => void;
  options: InputComboboxOption[];
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  placeholder?: string;
  emptyMessage?: React.ReactNode;
  showClear?: boolean;
  className?: string;
  classNames?: {
    base?: string;
    label?: string;
    input?: string;
    content?: string;
    list?: string;
    item?: string;
  };
}

function getOptionText(option: InputComboboxOption) {
  if (option.searchValue) {
    return option.searchValue;
  }

  return typeof option.label === "string" ? option.label : option.value;
}

function InputCombobox(props: InputComboboxProps) {
  const {
    value,
    defaultValue,
    onValueChange,
    options,
    label,
    description,
    errorMessage,
    placeholder = "Select an option",
    emptyMessage = "No option found.",
    showClear = true,
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
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const defaultOption = useMemo(
    () => options.find((option) => option.value === defaultValue) ?? null,
    [defaultValue, options],
  );

  return (
    <Field className={cn("gap-1", [className, classNames?.base])}>
      {label && (
        <FieldLabel htmlFor={inputId} isRequired={required} className={classNames?.label}>
          {label}
        </FieldLabel>
      )}

      <Combobox<InputComboboxOption>
        items={options}
        value={value !== undefined ? selectedOption : undefined}
        defaultValue={defaultValue !== undefined ? defaultOption : undefined}
        onValueChange={(nextValue) => {
          onValueChange?.(nextValue?.value);
        }}
        itemToStringLabel={getOptionText}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(itemValue, currentValue) => itemValue.value === currentValue.value}
        required={required}
        disabled={disabled}
        {...rest}
      >
        <ComboboxInput
          id={inputId}
          placeholder={placeholder}
          disabled={disabled}
          showClear={showClear}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={describedBy || undefined}
          className={cn("w-full", classNames?.input)}
        />

        <ComboboxContent className={classNames?.content}>
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>

          <ComboboxList className={classNames?.list}>
            {(option: InputComboboxOption) => (
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

export interface InputComboboxWithRHFProps<T extends FieldValues> extends Omit<
  InputComboboxProps,
  "errorMessage" | "value" | "onValueChange"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputComboboxWithRHFProps<T>) {
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
        <InputCombobox
          errorMessage={fieldState.error?.message}
          {...rest}
          value={field.value as string | undefined}
          onValueChange={field.onChange}
        />
      )}
    />
  );
}

InputCombobox.WithRHF = WithRHF;

export default InputCombobox;
export { InputCombobox, type InputComboboxOption };
