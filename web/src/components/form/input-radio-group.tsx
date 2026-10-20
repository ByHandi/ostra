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
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type InputRadioGroupOption = {
  label: React.ReactNode;
  value: string;
  description?: React.ReactNode;
  disabled?: boolean;
};

export interface InputRadioGroupProps extends React.ComponentProps<typeof RadioGroup> {
  options: InputRadioGroupOption[];
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  className?: string;
  classNames?: {
    base?: string;
    label?: string;
    description?: string;
    group?: string;
    item?: string;
    radio?: string;
    itemLabel?: string;
    itemDescription?: string;
    error?: string;
  };
}

function InputRadioGroup(props: InputRadioGroupProps) {
  const { options, label, description, errorMessage, required, className, classNames, ...rest } =
    props;

  const generatedId = useId();
  const groupId = generatedId;
  const descriptionId = description ? `${groupId}-description` : undefined;
  const errorId = errorMessage ? `${groupId}-error` : undefined;
  const describedBy = [rest["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ");
  const ariaInvalid = rest["aria-invalid"] ?? Boolean(errorMessage);

  return (
    <FieldSet
      aria-describedby={describedBy || undefined}
      aria-invalid={ariaInvalid}
      disabled={rest.disabled}
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

      <RadioGroup
        {...rest}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy || undefined}
        className={cn("gap-3", classNames?.group)}
      >
        {options.map((option) => {
          const itemId = `${groupId}-${option.value}`;
          const itemDescriptionId = option.description ? `${itemId}-description` : undefined;

          return (
            <FieldGroup key={option.value} className="gap-0">
              <Field
                data-disabled={rest.disabled || option.disabled || undefined}
                orientation="horizontal"
                className={cn("gap-2", classNames?.item)}
              >
                <RadioGroupItem
                  id={itemId}
                  value={option.value}
                  disabled={option.disabled}
                  aria-invalid={ariaInvalid}
                  aria-describedby={itemDescriptionId}
                  className={classNames?.radio}
                />

                <FieldContent>
                  <FieldLabel htmlFor={itemId} className={classNames?.itemLabel}>
                    {option.label}
                  </FieldLabel>

                  {option.description && (
                    <FieldDescription
                      id={itemDescriptionId}
                      className={classNames?.itemDescription}
                    >
                      {option.description}
                    </FieldDescription>
                  )}
                </FieldContent>
              </Field>
            </FieldGroup>
          );
        })}
      </RadioGroup>

      {errorMessage && (
        <FieldError id={errorId} className={cn("text-xs", classNames?.error)}>
          {errorMessage}
        </FieldError>
      )}
    </FieldSet>
  );
}

export interface InputRadioGroupWithRHFProps<T extends FieldValues> extends Omit<
  InputRadioGroupProps,
  "errorMessage" | "value" | "onValueChange"
> {
  name: Path<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, Path<T>>;
}

function WithRHF<T extends FieldValues>(props: InputRadioGroupWithRHFProps<T>) {
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
        <InputRadioGroup
          errorMessage={fieldState.error?.message}
          {...rest}
          value={field.value as string | undefined}
          onValueChange={field.onChange}
        />
      )}
    />
  );
}

InputRadioGroup.WithRHF = WithRHF;

export default InputRadioGroup;
export { InputRadioGroup, type InputRadioGroupOption };
