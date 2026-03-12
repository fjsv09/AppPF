'use client'

import { Check } from 'lucide-react'
import { WizardStepDefinition } from '@/types/wizard'

interface StepperProps {
  steps: readonly WizardStepDefinition[]
  currentStep: number
  completedSteps: number[]
}

export function Stepper({ steps, currentStep, completedSteps }: StepperProps) {
  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 mb-6 shadow-xl">
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        {steps.map((step, index) => {
          const stepNumber = step.number
          const isCompleted = completedSteps.includes(stepNumber)
          const isCurrent = stepNumber === currentStep
          const isPending = stepNumber > currentStep

          // Colores por paso
          const colorClasses = {
            1: {
              bg: isCompleted || isCurrent ? 'bg-purple-600' : 'bg-slate-800',
              text: isCompleted || isCurrent ? 'text-purple-400' : 'text-slate-500',
              shadow: isCompleted || isCurrent ? 'shadow-purple-900/30' : '',
              ring: isCurrent ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-900' : ''
            },
            2: {
              bg: isCompleted || isCurrent ? 'bg-blue-600' : 'bg-slate-800',
              text: isCompleted || isCurrent ? 'text-blue-400' : 'text-slate-500',
              shadow: isCompleted || isCurrent ? 'shadow-blue-900/30' : '',
              ring: isCurrent ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900' : ''
            },
            3: {
              bg: isCompleted || isCurrent ? 'bg-emerald-600' : 'bg-slate-800',
              text: isCompleted || isCurrent ? 'text-emerald-400' : 'text-slate-500',
              shadow: isCompleted || isCurrent ? 'shadow-emerald-900/30' : '',
              ring: isCurrent ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900' : ''
            }
          }

          const colors = colorClasses[stepNumber as keyof typeof colorClasses] || colorClasses[1]

          return (
            <div key={stepNumber} className="flex items-center gap-2 sm:gap-4">
              {/* Step Circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                    colors.bg
                  } ${isCompleted || isCurrent ? 'text-white shadow-lg' : 'text-slate-500'} ${colors.shadow} ${colors.ring}`}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : stepNumber}
                </div>
                <div className="text-center">
                  <span
                    className={`text-xs font-medium transition-colors ${
                      isCurrent
                        ? colors.text
                        : isCompleted
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                  <p className="text-xs text-slate-600 hidden sm:block">{step.description}</p>
                </div>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={`w-12 sm:w-16 h-1 rounded-full transition-all duration-300 ${
                    completedSteps.includes(stepNumber + 1) || currentStep > stepNumber
                      ? stepNumber === 1
                        ? 'bg-purple-600'
                        : stepNumber === 2
                        ? 'bg-blue-600'
                        : 'bg-emerald-600'
                      : 'bg-slate-800'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
