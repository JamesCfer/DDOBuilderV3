# v2calc - Linux console port of DDOBuilder V2's calculation core
#
# Builds unmodified DDOBuilder/ and XmlLib/ sources with g++ by:
#   1. putting v2calc/shim first on the include path so <windows.h>,
#      <afxwin.h>, <comdef.h> and `#import <msxml3.dll>` resolve to
#      Linux shims instead of the Win32/MFC/COM headers
#   2. generating an "include farm" of symlinks whose names contain
#      literal backslashes (e.g. 'XmlLib\DLMacros.h') so the codebase's
#      Windows-style include paths resolve on a case-sensitive filesystem
#      (this also fixes case mismatches like "StdAfx.h" vs stdafx.h)
#   3. replacing the MSXML-COM SaxReader with an expat implementation
#      (shim/SaxReaderLinux.cpp) behind the identical SaxReader interface
#
# Usage:
#   make -C v2calc            # builds build/v2calc
#   make -C v2calc run        # runs it against Output/DataFiles
#   make -C v2calc clean

V2CALC_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
ROOT       := $(abspath $(V2CALC_DIR)/..)
BUILD      := $(V2CALC_DIR)/build
FARM       := $(BUILD)/farm
OBJDIR     := $(BUILD)/obj

CXX      ?= g++
CXXFLAGS := -std=c++17 -g -O0 -DV2CALC_LINUX=1 \
            -ffunction-sections -fdata-sections \
            -Wno-deprecated -Wno-unknown-pragmas \
            -fpermissive \
            -MMD -MP
LDFLAGS  := -Wl,--gc-sections
LDLIBS   := -lexpat -lpthread

# include order matters:
#   shim first (captures <windows.h>, <afxwin.h>, <msxml3.dll>, ...)
#   farm next  (captures "XmlLib\Foo.h", "stdafx.h"/"StdAfx.h", "Resource.h")
#   then the real source trees
INCLUDES := -I$(V2CALC_DIR)/shim \
            -I$(FARM) \
            -I$(ROOT) \
            -I$(ROOT)/XmlLib \
            -I$(ROOT)/XmlLib/Src \
            -I$(ROOT)/DDOBuilder

# ---------------------------------------------------------------------------
# sources
# ---------------------------------------------------------------------------

# XmlLib: everything except the MSXML COM plumbing
#   excluded: SaxReader.cpp (replaced by shim/SaxReaderLinux.cpp),
#             SAXContentHandlerImpl.cpp, SAXErrorHandlerImpl.cpp,
#             SAXDTDHandlerImpl.cpp, SaxAttributesImpl.cpp (all COM-only),
#             StdAfx.cpp (PCH generator, nothing in it)
XMLLIB_SRC := \
    $(ROOT)/XmlLib/Src/CriticalSection.cpp \
    $(ROOT)/XmlLib/Src/SaxAttributes.cpp \
    $(ROOT)/XmlLib/Src/SaxContentElement.cpp \
    $(ROOT)/XmlLib/Src/SaxString.cpp \
    $(ROOT)/XmlLib/Src/SaxWriter.cpp \
    $(ROOT)/XmlLib/Src/VectorConversion.cpp

# DDOBuilder calculation-core files ported so far (UI files are never built)
DDO_SRC := \
    $(ROOT)/DDOBuilder/Attack.cpp \
    $(ROOT)/DDOBuilder/AttackBonus.cpp \
    $(ROOT)/DDOBuilder/AutomaticAcquisition.cpp \
    $(ROOT)/DDOBuilder/BaseDice.cpp \
    $(ROOT)/DDOBuilder/ConditionalGroup.cpp \
    $(ROOT)/DDOBuilder/DC.cpp \
    $(ROOT)/DDOBuilder/Dice.cpp \
    $(ROOT)/DDOBuilder/Effect.cpp \
    $(ROOT)/DDOBuilder/Feat.cpp \
    $(ROOT)/DDOBuilder/FeatsFile.cpp \
    $(ROOT)/DDOBuilder/Requirement.cpp \
    $(ROOT)/DDOBuilder/Requirements.cpp \
    $(ROOT)/DDOBuilder/RequirementsBase.cpp \
    $(ROOT)/DDOBuilder/RequiresNoneOf.cpp \
    $(ROOT)/DDOBuilder/RequiresOneOf.cpp \
    $(ROOT)/DDOBuilder/Stance.cpp \
    $(ROOT)/DDOBuilder/SubItem.cpp \
    $(ROOT)/DDOBuilder/Bonus.cpp \
    $(ROOT)/DDOBuilder/Build.cpp \
    $(ROOT)/DDOBuilder/Character.cpp \
    $(ROOT)/DDOBuilder/Life.cpp \
    $(ROOT)/DDOBuilder/Class.cpp \
    $(ROOT)/DDOBuilder/ClassFile.cpp \
    $(ROOT)/DDOBuilder/Race.cpp \
    $(ROOT)/DDOBuilder/RaceFile.cpp \
    $(ROOT)/DDOBuilder/AutomaticFeats.cpp \
    $(ROOT)/DDOBuilder/BasicDice.cpp \
    $(ROOT)/DDOBuilder/ClassSpell.cpp \
    $(ROOT)/DDOBuilder/FeatSlot.cpp \
    $(ROOT)/DDOBuilder/Spell.cpp \
    $(ROOT)/DDOBuilder/SpellDC.cpp \
    $(ROOT)/DDOBuilder/SpellDamage.cpp \
    $(ROOT)/DDOBuilder/SpellDice.cpp \
    $(ROOT)/DDOBuilder/BonusDice.cpp \
    $(ROOT)/DDOBuilder/AbilitySpend.cpp \
    $(ROOT)/DDOBuilder/ActiveStances.cpp \
    $(ROOT)/DDOBuilder/ArtifactFiligree.cpp \
    $(ROOT)/DDOBuilder/AttackBuff.cpp \
    $(ROOT)/DDOBuilder/AttackChain.cpp \
    $(ROOT)/DDOBuilder/Augment.cpp \
    $(ROOT)/DDOBuilder/Buff.cpp \
    $(ROOT)/DDOBuilder/Challenge.cpp \
    $(ROOT)/DDOBuilder/CompletedQuest.cpp \
    $(ROOT)/DDOBuilder/DestinySpendInTree.cpp \
    $(ROOT)/DDOBuilder/Destiny_SelectedTrees.cpp \
    $(ROOT)/DDOBuilder/EnhancementSelection.cpp \
    $(ROOT)/DDOBuilder/EnhancementSpendInTree.cpp \
    $(ROOT)/DDOBuilder/EnhancementTree.cpp \
    $(ROOT)/DDOBuilder/EnhancementTreeItem.cpp \
    $(ROOT)/DDOBuilder/Enhancement_SelectedTrees.cpp \
    $(ROOT)/DDOBuilder/EquippedGear.cpp \
    $(ROOT)/DDOBuilder/ExclusionGroup.cpp \
    $(ROOT)/DDOBuilder/FeatsListObject.cpp \
    $(ROOT)/DDOBuilder/Filigree.cpp \
    $(ROOT)/DDOBuilder/Gem.cpp \
    $(ROOT)/DDOBuilder/GuildBuff.cpp \
    $(ROOT)/DDOBuilder/Item.cpp \
    $(ROOT)/DDOBuilder/ItemAugment.cpp \
    $(ROOT)/DDOBuilder/ItemBuff.cpp \
    $(ROOT)/DDOBuilder/LevelTraining.cpp \
    $(ROOT)/DDOBuilder/ObserverSubject.cpp \
    $(ROOT)/DDOBuilder/OptionalBuff.cpp \
    $(ROOT)/DDOBuilder/Quest.cpp \
    $(ROOT)/DDOBuilder/ReaperSpendInTree.cpp \
    $(ROOT)/DDOBuilder/Reaper_SelectedTrees.cpp \
    $(ROOT)/DDOBuilder/SelectedEnhancementTrees.cpp \
    $(ROOT)/DDOBuilder/SelectedTrees.cpp \
    $(ROOT)/DDOBuilder/SetBonus.cpp \
    $(ROOT)/DDOBuilder/SetBonusBuff.cpp \
    $(ROOT)/DDOBuilder/SkillTomes.cpp \
    $(ROOT)/DDOBuilder/SlotUpgrade.cpp \
    $(ROOT)/DDOBuilder/SpellListAddition.cpp \
    $(ROOT)/DDOBuilder/SpendInTree.cpp \
    $(ROOT)/DDOBuilder/StackTracking.cpp \
    $(ROOT)/DDOBuilder/TrainedEnhancement.cpp \
    $(ROOT)/DDOBuilder/TrainedFeat.cpp \
    $(ROOT)/DDOBuilder/TrainedFiligree.cpp \
    $(ROOT)/DDOBuilder/TrainedSkill.cpp \
    $(ROOT)/DDOBuilder/TrainedSpell.cpp \
    $(ROOT)/DDOBuilder/WeaponFiligree.cpp \
    $(ROOT)/DDOBuilder/WeaponGroup.cpp \
    $(ROOT)/DDOBuilder/WeaponGroupRequirements.cpp \
    $(ROOT)/DDOBuilder/Selector.cpp \
    $(ROOT)/DDOBuilder/EquipmentSlot.cpp

SHIM_SRC := \
    $(V2CALC_DIR)/shim/SaxReaderLinux.cpp \
    $(V2CALC_DIR)/shim/GlobalsLinux.cpp \
    $(V2CALC_DIR)/shim/VectorConversionLinux.cpp \
    $(V2CALC_DIR)/shim/DocStub.cpp \
    $(V2CALC_DIR)/shim/GlobalDataLinux.cpp \
    $(V2CALC_DIR)/shim/UIStub.cpp \
    $(V2CALC_DIR)/shim/UIPaneStub.cpp

MAIN_SRC := $(V2CALC_DIR)/src/main.cpp

ALL_SRC := $(XMLLIB_SRC) $(DDO_SRC) $(SHIM_SRC) $(MAIN_SRC)

# object files mirror source paths relative to ROOT
OBJS := $(patsubst $(ROOT)/%.cpp,$(OBJDIR)/%.o,$(ALL_SRC))
DEPS := $(OBJS:.o=.d)

TARGET := $(BUILD)/v2calc

.PHONY: all run clean farm

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(LDFLAGS) -o $@ $(OBJS) $(LDLIBS)

$(OBJDIR)/%.o: $(ROOT)/%.cpp | farm
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -c $< -o $@

# ---------------------------------------------------------------------------
# include farm (see header comment). Regenerated cheaply on every build.
# ---------------------------------------------------------------------------
farm:
	@mkdir -p $(FARM)
	@for h in $(ROOT)/XmlLib/*.h; do \
	    b=$$(basename $$h); \
	    ln -sf "$$h" '$(FARM)/XmlLib\'"$$b"; \
	done
	@# resource.h is plain UTF-8/ASCII (converted once from its original UTF-16
	@# so it is readable on both g++ and the Windows RC compiler). The farm just
	@# provides the case-variant name "Resource.h" for includers that use it.
	@rm -f '$(FARM)/Resource.h'
	@ln -sf $(ROOT)/DDOBuilder/resource.h '$(FARM)/Resource.h'
	@ln -sf $(V2CALC_DIR)/shim/v2calc_stdafx.h '$(FARM)/stdafx.h'
	@ln -sf $(V2CALC_DIR)/shim/v2calc_stdafx.h '$(FARM)/StdAfx.h'
	@ln -sf $(ROOT)/DDOBuilder/stdafx.h '$(FARM)/v2calc_ddobuilder_stdafx.h'

run: $(TARGET)
	cd $(ROOT) && $(TARGET) Output/DataFiles/Feats.xml

clean:
	rm -rf $(BUILD)

-include $(DEPS)
