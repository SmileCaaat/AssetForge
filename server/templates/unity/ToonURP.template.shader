Shader "{{SHADER_NAME}}"
{
    Properties
    {
        _BaseMap ("Base Map", 2D) = "white" {}
        _BaseColorTint ("Base Color Tint", Color) = (1,1,1,1)

        _BumpMap ("Normal Map", 2D) = "bump" {}
        _BumpScale ("Normal Strength", Float) = 1

        _MetallicGlossMap ("Metallic Smoothness", 2D) = "white" {}

        _RampSteps ("Ramp Steps", Float) = 3
        _ShadowStrength ("Shadow Strength", Range(0,1)) = 0.45

        _RimColor ("Rim Color", Color) = (1,0.82,0.55,1)
        _RimPower ("Rim Power", Float) = 4
        _RimIntensity ("Rim Intensity", Float) = 2.5

        _OutlineWidth ("Outline Width", Float) = 0.015
        _OutlineColor ("Outline Color", Color) = (0,0,0,1)
    }

    SubShader
    {
        Tags
        {
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "Opaque"
            "Queue" = "Geometry"
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM

            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Generated/ToonCore.generated.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);

            float4 _BaseColorTint;
            float _RampSteps;
            float _ShadowStrength;
            float4 _RimColor;
            float _RimPower;
            float _RimIntensity;

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float2 uv : TEXCOORD2;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.positionHCS = TransformWorldToHClip(output.positionWS);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.uv = input.uv;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                float4 baseSample = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv);
                float3 baseColor = baseSample.rgb * _BaseColorTint.rgb;

                Light mainLight = GetMainLight();
                float3 normalWS = normalize(input.normalWS);
                float3 lightDirWS = normalize(mainLight.direction);
                float3 viewDirWS = normalize(GetWorldSpaceViewDir(input.positionWS));

                ToonParams p;
                p.baseColor = baseColor;
                p.rampSteps = _RampSteps;
                p.shadowStrength = _ShadowStrength;
                p.rimPower = _RimPower;
                p.rimIntensity = _RimIntensity;
                p.rimColor = _RimColor.rgb;

                float3 color = AMT_EvaluateToon(normalWS, lightDirWS, viewDirWS, p);

                return half4(color, baseSample.a * _BaseColorTint.a);
            }

            ENDHLSL
        }
    }

    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
