import { useId, useMemo } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface InputSwitchProps extends React.ComponentProps<typeof Switch> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  classNames?: {
    base?: string;
    switch?: string;
    label?: string;
    description?: string;
    error?: string;
  };
}

function InputSwitch(props: InputSwitchProps) {
  const { label, description, errorMessage, className, classNames, required, ...rest } = props;

  const generatedId = useId();
  const switchId = rest.id || generatedId;
  const descriptionId = description ? `${switchId}-description` : undefined;
  const errorId = errorMessage ? `${switchId}-error` : undefined;
  const describedBy = [rest["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ");
  const ariaInvalid = rest["aria-invalid"] ?? Boolean(errorMessage);

  return (
    <Field
      data-disabled={rest.disabled || undefined}
      data-invalid={Boolean(errorMessage) || undefined}
      orientation="horizontal"
      className={cn("items-start justify-between gap-3", [className, classNames?.base])}
    >
      <FieldContent>
        {label && (
          <FieldLabel htmlFor={switchId} isRequired={required} className={classNames?.label}>
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

      <Switch
        {...rest}
        id={switchId}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy || undefined}
        className={classNames?.switch}
      />
    </Field>
  );
}

export interface InputSwitchWithRHFProps<T extends FieldValues> extends Omit<
  InputSwitchProps,
  "errorMessage" | "checked" | "onCheckedChange"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputSwitchWithRHFProps<T>) {
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
        <InputSwitch
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

InputSwitch.WithRHF = WithRHF;

export default InputSwitch;
export { InputSwitch };
