from rest_framework import serializers
from datetime import datetime

WEEKDAYS = {"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"}


class ForecastSerializer(serializers.Serializer):
    Timestamp = serializers.CharField()
    city = serializers.CharField(max_length=100)
    weekday = serializers.CharField()
    hour = serializers.IntegerField(min_value=0, max_value=23)
    tavg = serializers.FloatField()
    prcp = serializers.FloatField()
    wspd = serializers.FloatField()
    humidity = serializers.FloatField()
    is_holiday = serializers.IntegerField(required=False)

    def validate_Timestamp(self, value):
        # Accepts parseable datetime strings
        try:
            datetime.fromisoformat(value)
        except Exception:
            try:
                datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
            except Exception:
                raise serializers.ValidationError("Timestamp must be a valid datetime string")
        return value

    def validate_weekday(self, value):
        if value not in WEEKDAYS:
            raise serializers.ValidationError(f"weekday must be one of {', '.join(sorted(WEEKDAYS))}")
        return value
