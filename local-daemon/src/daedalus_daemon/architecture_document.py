import json
from pathlib import Path
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


DAEDALUS_ROOT = Path(__file__).resolve().parents[3]
SOFTWARE_ARCHITECTURE_SCHEMA_PATH = (
    DAEDALUS_ROOT / "shared" / "schemas" / "software-architecture-v1.schema.json"
)
IDENTIFIER_PATTERN = r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$"


class ArchitectureDocumentModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class NamedFieldDefinition(ArchitectureDocumentModel):
    name: str = Field(min_length=1, pattern=IDENTIFIER_PATTERN)
    summary: str = Field(min_length=1)
    required: bool = True

    @field_validator("summary")
    @classmethod
    def require_field_summary_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must contain non-whitespace text")
        return value


class PrimitiveFieldDefinition(NamedFieldDefinition):
    type: Literal["string", "number", "integer", "boolean", "null"]


class ArrayFieldDefinition(NamedFieldDefinition):
    type: Literal["array"]
    items: "FieldDefinition"


class ObjectFieldDefinition(NamedFieldDefinition):
    type: Literal["object"]
    fields: list["FieldDefinition"]


FieldDefinition: TypeAlias = Annotated[
    PrimitiveFieldDefinition | ArrayFieldDefinition | ObjectFieldDefinition,
    Field(discriminator="type"),
]


class SystemDefinition(ArchitectureDocumentModel):
    id: str = Field(min_length=1, pattern=IDENTIFIER_PATTERN)
    name: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    files: list[str]

    @field_validator("name", "summary")
    @classmethod
    def require_system_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must contain non-whitespace text")
        return value

    @field_validator("files")
    @classmethod
    def require_unique_non_empty_files(cls, files: list[str]) -> list[str]:
        for file_path in files:
            if not file_path.strip():
                raise ValueError("file paths must contain non-whitespace text")
        if len(files) != len(set(files)):
            raise ValueError("file paths must be unique within a system")
        return files


class ChannelDefinition(ArchitectureDocumentModel):
    id: str = Field(min_length=1, pattern=IDENTIFIER_PATTERN)
    name: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    source_system_id: str = Field(min_length=1, pattern=IDENTIFIER_PATTERN)
    target_system_id: str = Field(min_length=1, pattern=IDENTIFIER_PATTERN)
    fields: list[FieldDefinition]

    @field_validator("name", "summary")
    @classmethod
    def require_channel_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must contain non-whitespace text")
        return value


class SoftwareArchitecture(ArchitectureDocumentModel):
    schema_version: Literal["1.0"]
    summary: str = Field(min_length=1)
    systems: list[SystemDefinition]
    channels: list[ChannelDefinition]

    @field_validator("summary")
    @classmethod
    def require_architecture_summary_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must contain non-whitespace text")
        return value

    @model_validator(mode="after")
    def validate_graph(self) -> "SoftwareArchitecture":
        system_ids = [system.id for system in self.systems]
        if len(system_ids) != len(set(system_ids)):
            raise ValueError("system IDs must be unique")
        channel_ids = [channel.id for channel in self.channels]
        if len(channel_ids) != len(set(channel_ids)):
            raise ValueError("channel IDs must be unique")
        declared_system_ids = set(system_ids)
        for channel in self.channels:
            if channel.source_system_id not in declared_system_ids:
                raise ValueError(
                    f"channel {channel.id} source_system_id does not identify a declared system"
                )
            if channel.target_system_id not in declared_system_ids:
                raise ValueError(
                    f"channel {channel.id} target_system_id does not identify a declared system"
                )
        return self


ArrayFieldDefinition.model_rebuild()
ObjectFieldDefinition.model_rebuild()
ChannelDefinition.model_rebuild()


def load_published_architecture_schema() -> dict:
    return json.loads(SOFTWARE_ARCHITECTURE_SCHEMA_PATH.read_text(encoding="utf-8"))


def parse_and_validate_architecture_response(raw_response: str) -> dict:
    document = json.loads(raw_response)
    return SoftwareArchitecture.model_validate(document).model_dump(mode="json")


def format_architecture_validation_errors(error: Exception) -> str:
    if isinstance(error, json.JSONDecodeError):
        return (
            f"JSON syntax error at line {error.lineno}, column {error.colno}: "
            f"{error.msg}"
        )
    if isinstance(error, ValidationError):
        details = []
        for problem in error.errors(include_url=False, include_context=False):
            path = ".".join(str(part) for part in problem["loc"]) or "$"
            details.append(f"{path} [{problem['type']}]: {problem['msg']}")
        return "\n".join(details)
    return str(error)
