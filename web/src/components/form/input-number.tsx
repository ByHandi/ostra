import { useId, useMemo } from "react";
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

export interface InputNumberProps extends Omit<React.ComponentProps<"input">, "type"> {
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
  hideStepper?: boolean;
}

function InputNumber(props: InputNumberProps) {
  const {
    required,
    label,
    description,
    errorMessage,
    className,
    classNames,
    startContent,
    endContent,
    inputMode,
    hideStepper,
    ...rest
  } = props;

  const generatedId = useId();
  const inputId = rest.id || generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  const describedBy = [rest["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ");
  const ariaInvalid = rest["aria-invalid"] ?? Boolean(errorMessage);

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
          type="number"
          required={required}
          inputMode={inputMode ?? "decimal"}
          aria-invalid={ariaInvalid}
          aria-describedby={describedBy || undefined}
          className={cn(
            hideStepper &&
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            classNames?.input,
          )}
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

export interface InputNumberWithRHFProps<T extends FieldValues> extends Omit<
  InputNumberProps,
  "name" | "errorMessage"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputNumberWithRHFProps<T>) {
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
        <InputNumber errorMessage={fieldState.error?.message} {...rest} {...field} />
      )}
    />
  );
}

InputNumber.WithRHF = WithRHF;

export default InputNumber;
