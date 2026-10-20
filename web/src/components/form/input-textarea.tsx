import { useId, useMemo } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface InputTextareaProps extends React.ComponentProps<"textarea"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  classNames?: {
    base?: string;
    label?: string;
    textarea?: string;
    description?: string;
    error?: string;
  };
}

function InputTextarea(props: InputTextareaProps) {
  const { required, label, description, errorMessage, className, classNames, ...rest } = props;

  const generatedId = useId();
  const textareaId = rest.id || generatedId;
  const descriptionId = description ? `${textareaId}-description` : undefined;
  const errorId = errorMessage ? `${textareaId}-error` : undefined;
  const describedBy = [rest["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ");
  const ariaInvalid = rest["aria-invalid"] ?? Boolean(errorMessage);

  return (
    <Field className={cn("gap-1", [className, classNames?.base])}>
      {label && (
        <FieldLabel htmlFor={textareaId} isRequired={required} className={classNames?.label}>
          {label}
        </FieldLabel>
      )}

      <Textarea
        {...rest}
        id={textareaId}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy || undefined}
        className={classNames?.textarea}
      />

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
    </Field>
  );
}

export interface InputTextareaWithRHFProps<T extends FieldValues> extends Omit<
  InputTextareaProps,
  "name" | "errorMessage"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputTextareaWithRHFProps<T>) {
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
        <InputTextarea errorMessage={fieldState.error?.message} {...rest} {...field} />
      )}
    />
  );
}

InputTextarea.WithRHF = WithRHF;

export default InputTextarea;
export { InputTextarea };
