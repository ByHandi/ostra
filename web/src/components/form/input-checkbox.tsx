import { useId, useMemo } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface InputCheckboxProps extends React.ComponentProps<typeof Checkbox> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  classNames?: {
    base?: string;
    checkbox?: string;
    label?: string;
    description?: string;
    error?: string;
  };
}

function InputCheckbox(props: InputCheckboxProps) {
  const { label, description, errorMessage, className, classNames, required, ...rest } = props;

  const generatedId = useId();
  const checkboxId = rest.id || generatedId;
  const descriptionId = description ? `${checkboxId}-description` : undefined;
  const errorId = errorMessage ? `${checkboxId}-error` : undefined;
  const describedBy = [rest["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ");
  const ariaInvalid = rest["aria-invalid"] ?? Boolean(errorMessage);

  return (
    <Field
      data-disabled={rest.disabled || undefined}
      data-invalid={Boolean(errorMessage) || undefined}
      orientation="horizontal"
      className={cn("gap-2", [className, classNames?.base])}
    >
      <Checkbox
        {...rest}
        id={checkboxId}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy || undefined}
        className={classNames?.checkbox}
      />

      <FieldContent>
        {label && (
          <FieldLabel htmlFor={checkboxId} isRequired={required} className={classNames?.label}>
            {label}
          </FieldLabel>
        )}

        {description && (
          <FieldDescription id={descriptionId} className={classNames?.description}>
            {description}
          </FieldDescription>
        )}

        {errorMessage && (
          <FieldError id={errorId} className={cn("text-xs", classNames?.error)}>
            {errorMessage}
          </FieldError>
        )}
      </FieldContent>
    </Field>
  );
}

export interface InputCheckboxWithRHFProps<T extends FieldValues> extends Omit<
  InputCheckboxProps,
  "errorMessage" | "checked" | "onCheckedChange"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputCheckboxWithRHFProps<T>) {
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
        <InputCheckbox
          errorMessage={fieldState.error?.message}
          {...rest}
          checked={field.value as boolean}
          onCheckedChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

InputCheckbox.WithRHF = WithRHF;

export default InputCheckbox;
export { InputCheckbox };
